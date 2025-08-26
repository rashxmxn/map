import MapView from "@/components/MapView";
import DefaultLayout from "@/layouts/default";
import { Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Feature, Polygon } from "geojson";
import { Tabs, Tab } from "@heroui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Expand, X } from "lucide-react";
import MapModal from "@/components/MapModal";

type Company = {
  location: string;
  company_title: string;
  type: string; // "добыча" | "разведка"
  category: string; // "ОПИ" | "ТПИ"
};

type Region = {
  id: string;
  name: string;
  company: Company[];
  coordinates: [number, number][];
  url?: string;
};

function countUniqueCompanyTitles(region: Region): number {
  const titles = region.company.map((c) => c.company_title);
  const unique = new Set(titles);
  return unique.size;
}

function filterCompaniesByType(
  companies: Company[], // Changed to accept an array of companies
  type: "добыча" | "разведка",
): Company[] {
  return companies.filter((c) => c.type === type);
}

function filterCompaniesByCategory(
  region: Region,
  category: "ОПИ" | "ТПИ",
): Company[] {
  return region.company.filter((c) => c.category.toUpperCase().includes(category));
}

function countCompanyTypes(companies: Company[]): {
  разведка: number;
  добыча: number;
} {
  let result = { разведка: 0, добыча: 0 };
  for (const company of companies) {
    if (company.type === "разведка") {
      result.разведка++;
    } else if (company.type === "добыча") {
      result.добыча++;
    }
  }
  return result;
}

function countUniqueOPIandTPI(region: Region): { ОПИ: number; ТПИ: number } {
  const opiSet = new Set<string>();
  const tpiSet = new Set<string>();
  for (const company of region.company) {
    const category = company.category.toUpperCase();
    const title = company.company_title;
    if (category.includes("ОПИ")) {
      opiSet.add(title);
    } else if (category.includes("ТПИ")) {
      tpiSet.add(title);
    }
  }
  return { ОПИ: opiSet.size, ТПИ: tpiSet.size };
}

export default function MapPage() {
  const mapRef = useRef<LeafletMap | null>(null);
  const [polygonCoords, setPolygonCoords] = useState<[number, number][] | null>(
    null,
  );
  const [isInfoShow, setIsInfoShow] = useState<boolean>(false);
  const [data, setData] = useState<{
    id?: string;
    tparcel?: string; // тип участка (например, "горный")
    parcelarea?: string; // площадь, возможно пригодится преобразовать в number
    nlicense?: string; // номер лицензии
    "admterr_id/oblast_admterr_id/name"?: string; // название области (рус)
    "admterr_id/oblast_admterr_id/name_kk"?: string; // название области (каз)
    mineraldeveloper?: string; // недропользователь
    "admterr_id/oblast_admterr_id"?: string; // ID области
    contractend_date?: string; // дата окончания контракта (ISO строка)
    tminerals?: string; // тип полезного ископаемого
    deposit?: string; // месторождение
    parceldepth?: string; // глубина участка
    ncontract?: string; // номер контракта
    contractbegin_date?: string; // дата начала контракта
    parcel_date?: string; // дата регистрации участка
  }>();
  const [cRegion, setRegion] = useState<Region>({
    name: "",
    id: "",
    company: [],
    coordinates: [],
    url: "",
  });
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<
    "TPI" | "OPI" | "default"
  >("default"); // New state for outer tabs
  const [selectedTypeKey, setSelectedTypeKey] = useState<"razvedka" | "dobycha" | "default">("default"); // New state for inner tabs
  const [currentCompany, setCurrentCompany] = useState<Company>();
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [filteredCompaniesByCategory, setFilteredCompaniesByCategory] = useState<
    Company[]
  >([]); // New state to hold companies filtered by category
  const [isError, setIsError] = useState<string>('');
  const [isMapModalOpen, setIsMapModalOpen] = useState<boolean>(false);
  const [allCompanyPolygons, setAllCompanyPolygons] = useState<{
    [key: string]: {
      coordinates: [number, number][];
      company: Company;
    }
  }>({});

  useEffect(() => {
    setData({});
    setIsInfoShow(false);
  }, [selectedCompanies]);

  const [regionPolygons, setRegionPolygons] = useState<
    {
      id: string;
      name: string;
      company: Company[];
      coordinates: [number, number][]; // [lat, lon]
      url?: string;
    }[]
  >([]);

  const handleCompanySelect = (companyData: Company[]) => {
    setSelectedCompanies(companyData);
  };

  useEffect(() => {
    const fn2 = async () => {
      const res = await fetch("https://map.choices.kz/api/get_area.php");
      const resData = await res.json();
      if (resData?.features) {
        const features: Feature<Polygon>[] = resData.features;
        const polygons = features
          .filter((feature) => (feature as any)?.region?.coordinates?.[0]?.[0])
          .map((feature, i) => {
            const rawCoords = (feature as any).region
              .coordinates[0][0] as number[][];
            const coords = rawCoords.map(
              (coord) => [coord[1], coord[0]] as [number, number],
            );
            return {
              id: `region-${i}`,
              name: (feature as any).properties?.name,
              url: (feature as any).url,
              company: (feature as any).company,
              coordinates: coords,
            };
          });
        setRegionPolygons(polygons);
        
        // Load all company polygons
        await loadAllCompanyPolygons(polygons);
      }
    };
    fn2();
  }, []);

  const loadAllCompanyPolygons = async (regions: typeof regionPolygons) => {
    console.log("Starting to load company polygons...", regions.length, "regions");
    const companyPolygons: {
      [key: string]: {
        coordinates: [number, number][];
        company: Company;
      }
    } = {};
    
    let loadedCount = 0;
    let totalCompanies = 0;
    
    // Count total companies first
    for (const region of regions) {
      totalCompanies += region.company.length;
    }
    
    console.log("Total companies to load:", totalCompanies);
    
    for (const region of regions) {
      console.log(`Loading companies for region: ${region.name} (${region.company.length} companies)`);
      for (const company of region.company) {
        try {
          const res = await fetch(
            "https://map.choices.kz/api/info.php?location=" + company.location,
          );
          const data = await res.json();
          
          if (!data.error && data.coordinates?.[0]?.[0]) {
            const rawPolygon = data.coordinates[0][0];
            const polygon = rawPolygon.map(([lon, lat]: [number, number]) => [
              lat,
              lon,
            ]);
            
            companyPolygons[company.location] = {
              coordinates: polygon,
              company: company,
            };
            loadedCount++;
            console.log(`✅ Loaded ${company.company_title} (${loadedCount}/${totalCompanies})`);
          } else {
            console.log(`❌ Failed to load ${company.company_title}:`, data.error || "No coordinates");
          }
        } catch (error) {
          console.error(`❌ Error loading polygon for ${company.location}:`, error);
        }
      }
    }
    
    console.log(`Finished loading. Total polygons loaded: ${Object.keys(companyPolygons).length}`);
    setAllCompanyPolygons(companyPolygons);
  };

  const handleFocus = async (location: string) => {
    const res = await fetch(
      "https://map.choices.kz/api/info.php?location=" + location,
    );
    const data = await res.json();
    if(await data.error) {
      setIsInfoShow(false);
      setIsError('Информация не найдена');
      return;
    }
    setIsError('');
    setData(await data);
    setIsInfoShow(true);
    const rawPolygon = data.coordinates?.[0]?.[0];
    if (!rawPolygon) return;
    const polygon = rawPolygon.map(([lon, lat]: [number, number]) => [
      lat,
      lon,
    ]); // 🔄 меняем порядок
    setTimeout(() => {
      setPolygonCoords(polygon);
    }, 1300);
    if (mapRef.current) {
      const center = L.polygon(polygon).getBounds().getCenter();
      mapRef.current.flyTo(center, 15, { animate: true, duration: 1 });
    }
  };

  const mapViewProps = { // Collect all props for MapView here
    mapRef,
    polygonCoords,
    regionPolygons,
    allCompanyPolygons,
    getCompany: handleCompanySelect,
    setRegion,
    setCurrentCompany,
    currentCompany,
  };

  return (
    <DefaultLayout>
      <div className="flex w-full h-full">
        <div className="w-full h-full flex flex-col">
          { !isMapModalOpen && <MapView {...mapViewProps} /> }
          { isError !== '' && <div className="flex flex-col bg-red-100 p-2 px-4 rounded-xl mt-2">
              <h2 className="text-red-800 text-sm">Ошибка</h2>
              <p className="text-red-700 text-sm">{ isError }</p>
            </div> }
          {isInfoShow && (
            <div className="grid grid-cols-3 gap-3 bg-[#f4f4f5] dark:bg-[#18181b] rounded-2xl p-4 h-[300px] overflow-y-auto my-2 border-1 dark:border-gray-800">
              <div className="w-full col-span-3 flex justify-end">
                <button
                  onClick={() => {
                    setIsInfoShow(false);
                  }}
                >
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div className="">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Область
                </p>
                <h4>{data?.["admterr_id/oblast_admterr_id/name"]}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Месторождение
                </p>
                <h4>{data?.deposit}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Номер контракта/лицензии
                </p>
                <h4>{data?.nlicense}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Площадь отвода (км2)
                </p>
                <h4>{data?.parcelarea}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Недропользователь
                </p>
                <h4>{data?.mineraldeveloper}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Номер контракта/лицензии
                </p>
                <h4>{data?.ncontract}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Дата выдачи контракта/лицензии
                </p>
                <h4>{data?.contractbegin_date}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Срок действия контракта/лицензии
                </p>
                <h4>{data?.contractend_date}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Отвод</p>
                <h4>{data?.tparcel}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Полезные ископаемые
                </p>
                <h4>{data?.tminerals}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Глубина отвода (м)
                </p>
                <h4>{data?.parceldepth}</h4>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Дата выдачи отвода
                </p>
                <h4>{data?.parcel_date}</h4>
              </div>
            </div>
          )}
        </div>
        <div className="max-w-[330px] w-full h-full bg-white dark:bg-black px-3 py-1 overflow-y-auto">
          <button
              onClick={() => setIsMapModalOpen(true)}
              className="w-full mb-2 text-white text-sm flex items-center justify-center gap-1.5 bg-primary-500 dark:bg-primary-400 p-2 px-3 rounded-xl hover:bg-primary-400 dark:hover:bg-primary-300"
              aria-label="Открыть карту на полный экран"
            >
              <Expand size={16} />
              <span>Открыть карту на полный экран</span>
          </button>
          <h2 className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            Информация о {cRegion.name}:
          </h2>
          {cRegion.url != "" && (
            <img
              src={cRegion.url}
              className="rounded-xl mb-2"
              width={"100%"}
              height={100}
            />
          )}
          <Table>
            <TableHeader>
              <TableColumn>Недропользователей</TableColumn>
              <TableColumn>ТПИ</TableColumn>
              <TableColumn>ОПИ</TableColumn>
            </TableHeader>
            <TableBody>
              <TableRow key="1">
                <TableCell>{countUniqueCompanyTitles(cRegion)}</TableCell>
                <TableCell>{countUniqueOPIandTPI(cRegion).ТПИ}</TableCell>
                <TableCell>{countUniqueOPIandTPI(cRegion).ОПИ}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Outer Tabs for TPI/OPI */}
          <Tabs
            aria-label="Category Options"
            selectedKey={selectedCategoryKey}
            onSelectionChange={(key) => {
              setSelectedCategoryKey(key as "TPI" | "OPI" | "default");
              setSelectedTypeKey("default"); // Reset inner tab when outer tab changes
              let companiesToFilter: Company[] = [];
              if (key === "TPI") {
                companiesToFilter = filterCompaniesByCategory(cRegion, "ТПИ");
              } else if (key === "OPI") {
                companiesToFilter = filterCompaniesByCategory(cRegion, "ОПИ");
              }
              setFilteredCompaniesByCategory(companiesToFilter);
              handleCompanySelect([]); // Clear selected companies when category changes
            }}
            className="mt-4 mb-2"
          >
            <Tab key="TPI" title={`ТПИ: ${countUniqueOPIandTPI(cRegion).ТПИ}`} />
            <Tab key="OPI" title={`ОПИ: ${countUniqueOPIandTPI(cRegion).ОПИ}`} />
          </Tabs>

          {/* Inner Tabs for Разведка/Добыча */}
          {selectedCategoryKey !== "default" && (
            <Tabs
              aria-label="Type Options"
              selectedKey={selectedTypeKey}
              onSelectionChange={(key) => {
                setSelectedTypeKey(key as "razvedka" | "dobycha" | "default");
                if (key === "razvedka") {
                  handleCompanySelect(
                    filterCompaniesByType(filteredCompaniesByCategory, "разведка"),
                  );
                } else if (key === "dobycha") {
                  handleCompanySelect(
                    filterCompaniesByType(filteredCompaniesByCategory, "добыча"),
                  );
                }
              }}
              className="mt-2 mb-2"
            >
              <Tab
                key="razvedka"
                title={`Разведки: ${countCompanyTypes(filteredCompaniesByCategory).разведка}`}
              />
              <Tab
                key="dobycha"
                title={`Добычи: ${countCompanyTypes(filteredCompaniesByCategory).добыча}`}
              />
            </Tabs>
          )}

          {/* Display companies based on selected inner tab */}
          {selectedTypeKey !== "default" ? (
            <div className="flex flex-col gap-3">
              {selectedCompanies?.map((e, index) => (
                <button
                  key={index}
                  onClick={() => {
                    handleFocus(e.location);
                    setCurrentCompany(e);
                  }}
                  color="primary"
                  className="w-full text-sm text-gray-700 dark:text-gray-300 text-left"
                >
                  {index + 1}. {e.company_title}
                </button>
              ))}
            </div>
          ) : (
            selectedCategoryKey !== "default" && (
              <p className="w-full text-xs text-gray-500 text-center mt-3">
                Нажмите разведки/добычи чтобы увидеть недропользователей
              </p>
            )
          )}

          {selectedCategoryKey === "default" && (
            <p className="w-full text-xs text-gray-500 text-center mt-3">
              Выберите ТПИ или ОПИ для фильтрации недропользователей
            </p>
          )}
        </div>
      </div>
      <MapModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        mapViewProps={mapViewProps}
      />
    </DefaultLayout>
  );
}