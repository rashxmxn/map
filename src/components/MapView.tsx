import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
} from "react-leaflet";
import L, { LeafletEvent, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import ReactDOMServer from "react-dom/server";
import * as turf from "@turf/turf";


// Загружаем GeoJSON Казахстана с регионами
import kzRegions from "@/assets/get_geojson.json"; // убедись, что путь правильный
import React, { useEffect } from "react";

// type Company = {
//   location: string;
//   company_title: string;
//   type: string;
//   category: string;
// };

// type Region = {
//   id: string;
//   name: string;
//   company: Company[];
//   coordinates: [number, number][];
// };


const regionFeature = {
  type: "Feature" as const,
  properties: {},
  geometry: kzRegions,
};

//const vkoBounds: LatLngBoundsExpression = L.geoJSON(regionFeature).getBounds();

const iconHtml = ReactDOMServer.renderToString(
  <MapPin color="#026fee" size={32} />,
);

// Установка иконок по умолчанию
const customIcon = L.divIcon({
  html: iconHtml,
  className: "",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

// Хук голосового ввода
const useVoiceRecognition = (onResult: (query: string) => void) => {
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API не поддерживается в этом браузере.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim();
      console.log("Голосовой ввод:", transcript);
      onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Ошибка распознавания:", event.error);
    };

    const startRecognition = () => {
      recognition.start();
    };

    (window as any).startVoiceSearch = startRecognition;
  }, [onResult]);
};

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

export interface MapViewProps { // Add this interface
  mapRef: React.MutableRefObject<LeafletMap | null>;
  polygonCoords: [number, number][] | null;
  regionPolygons: {
    id: string;
    name: string;
    company: {
      location: string;
      company_title: string;
      type: string;
      category: string;
    }[];
    coordinates: [number, number][]; // [lat, lon]
    url?: string; // Add url here if it's part of the region object
  }[];
  allCompanyPolygons?: {
    [key: string]: {
      coordinates: [number, number][];
      company: {
        location: string;
        company_title: string;
        type: string;
        category: string;
      };
    }
  };
  getCompany?: (companyData: Company[]) => void; // Make this explicit
  setRegion?: (region: Region) => void; // Make this explicit
  setCurrentCompany?: (company: Company) => void; // Add this
  currentCompany?: {
    location: string;
    company_title: string;
    type: string;
    category: string;
  };
}


const MapView = ({
  mapRef,
  polygonCoords,
  regionPolygons,
  allCompanyPolygons = {},
  getCompany,
  setRegion,
  setCurrentCompany,
  currentCompany,
}: MapViewProps) => { 
  //const popupRefs = useRef<Record<string, L.Popup>>({});


  useEffect(() => {
    if (!polygonCoords || regionPolygons.length === 0) return;

    // Преобразуем ТОО в GeoJSON полигон
    const tooPolygon = turf.polygon([
      polygonCoords.map(([lat, lon]) => [lon, lat]),
    ]);

    for (const region of regionPolygons) {
      const regionGeo = turf.polygon([
        region.coordinates.map(([lat, lon]) => [lon, lat]),
      ]);

      const isInside = turf.booleanWithin(tooPolygon, regionGeo);

      if (isInside) {
        //console.log(region.company);
        //console.log(`✅ ТОО находится внутри района: ${region.name}`);
      }
    }
  }, [polygonCoords, regionPolygons]);

function similarityScore(a: string, b: string): number {
  a = a.toLowerCase().replace(/\s|-/g, "");
  b = b.toLowerCase().replace(/\s|-/g, "");

  if (a.includes(b) || b.includes(a)) return 1;

  let matches = 0;
  const minLen = Math.min(a.length, b.length);

  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
  }

  return matches / Math.max(a.length, b.length);
}

useVoiceRecognition((query: string) => {
  const normQuery = query.toLowerCase().replace(/[^a-zа-яё0-9\s-]/gi, ""); // убираем знаки препинания
  const words = normQuery.split(/\s+/); // разбиваем на слова

  let bestMatch: typeof regionPolygons[0] | null = null;
  let bestScore = 0;

  for (const region of regionPolygons) {
    const regionName = region.name.toLowerCase().replace(/\s|-/g, "");

    for (const word of words) {
      const wordNorm = word.replace(/\s|-/g, "");

      // 💡 приоритет "вхождения"
      if (regionName.includes(wordNorm) || wordNorm.includes(regionName)) {
        console.log(`🎯 Включение: "${wordNorm}" ⊂ "${regionName}"`);
        bestMatch = region;
        bestScore = 1;
        break;
      }

      const score = similarityScore(wordNorm, regionName);
      console.log(`⚙️ Сравниваю: ${wordNorm} vs ${regionName} → ${score}`);

      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = region;
      }
    }

    if (bestScore === 1) break; // нашли по включению — выходим из внешнего цикла
  }

  if (bestMatch) {
    console.log("🎤 Найден регион по голосу:", bestMatch.name);
    getCompany?.(bestMatch.company);
    setRegion?.(bestMatch);

    const center = L.polygon(bestMatch.coordinates).getBounds().getCenter();
    mapRef.current?.setView(center, 9);
  } else {
    //alert(`Не найдено региона по запросу: ${query}`);
  }
});





  return (
    <MapContainer
      center={[49.95, 82.62]} // Original center
      zoom={7}
      minZoom={7}
      maxZoom={15}
      style={{ height: "100%", width: "100%", borderRadius: "20px", // 👈 скругление углов
      overflow: "hidden" }}
      whenReady={
        ((event: LeafletEvent) => {
          mapRef.current = event.target as LeafletMap;
        }) as () => void
      }
      maxBounds={L.geoJSON(regionFeature).getBounds()}
      maxBoundsViscosity={1.0}
      
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="&copy; OpenStreetMap contributors"
      />

      {/* Отображаем только Восточно-Казахстанскую область */}
      {/* <GeoJSON
        data={regionFeature}
        style={{
          color: "blue",
          weight: 2,
          fillColor: "rgba(0, 0, 255, 0.1)",
        }}
      /> */}

      {regionPolygons.map((region) => {
        const center = L.polygon(region.coordinates).getBounds().getCenter();
        return (
          <>
            <Polygon
              positions={region.coordinates}
              pathOptions={{ 
                color: "#026fee", 
                weight: 2,
                fillColor: "transparent",
                fillOpacity: 0
              }}
              eventHandlers={{
                click: () => {
                  //console.log(region.company);
                  getCompany?.(region.company);
                  setRegion?.(region)
                },
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 0.4,
                    color: "#026fee",
                    weight: 3
                  });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillColor: "transparent",
                    fillOpacity: 0,
                    color: "#026fee",
                    weight: 2
                  });
                },
              }}
            />
            <Marker
              position={center}
              icon={L.divIcon({
                html: `<div className="region-label">${region.name}</div>`,
                className: "region-label-wrapper text-gray-200 text-center font-medium leading-3", // важно: базовый класс
                iconSize: [100, 50],
                iconAnchor: [50, 15],
              })}
              interactive={false}
               // чтобы не перехватывал клики
            />
            {/* <Marker
              position={L.polygon(region.coordinates).getBounds().getCenter()}
              icon={customIcon}
            > */}
              {/* <Popup
                ref={(ref) => {
                  if (ref) popupRefs.current[region.id] = ref;
                }}
              >
                <div>
                  <div>
                    <strong>{region.name}</strong>
                  </div>
                  <div>
                    Недропользователи: {countUniqueCompanyTitles(region)}
                  </div>
                  <div>Добычи: {countCompanyTypes(region).добыча}</div>
                  <button
                    className="bg-gray-800 text-white p-2"
                    onClick={() => {
                      getCompany?.(filterCompaniesByType(region, "добыча"));
                      mapRef.current?.closePopup();
                    }}
                  >
                    Показать
                  </button>
                  <div>Разведки: {countCompanyTypes(region).разведка}</div>
                  <button
                    className="bg-gray-800 text-white p-2"
                    onClick={() => {
                      getCompany?.(filterCompaniesByType(region, "разведка"));
                      mapRef.current?.closePopup();
                    }}
                  >
                    Показать
                  </button>
                  <div>ТПИ: {countUniqueCategories(region)}</div>
                </div>
              </Popup> */}
            {/* </Marker> */}
          </>
        );
      })}
      {/* Тестовый маркер */}

      {/* Render all company polygons */}
      {Object.entries(allCompanyPolygons).map(([location, data]) => {
        console.log("Rendering polygon for:", data.company.company_title, data.company.type);
        return (
        <Polygon
          key={location}
          positions={data.coordinates}
          pathOptions={{ 
            color: data.company.type === "добыча" ? "#f59e0b" : "#10b981", // Orange for добыча, green for разведка
            weight: 1,
            fillColor: data.company.type === "добыча" ? "#f59e0b" : "#10b981",
            fillOpacity: 0.2 
          }}
          eventHandlers={{
            click: () => {
              setCurrentCompany?.(data.company);
              if (mapRef.current) {
                const center = L.polygon(data.coordinates).getBounds().getCenter();
                mapRef.current.flyTo(center, 15, { animate: true, duration: 1 });
              }
            },
            mouseover: (e) => {
              const layer = e.target;
              layer.setStyle({
                fillOpacity: 0.5,
                weight: 2
              });
            },
            mouseout: (e) => {
              const layer = e.target;
              layer.setStyle({
                fillOpacity: 0.2,
                weight: 1
              });
            },
          }}
        />
        );
      })}

      {/* Пример полигона */}
      {polygonCoords && (
        <>
          <Marker
            position={L.polygon(polygonCoords).getBounds().getCenter()}
            icon={customIcon}
          >
            <Popup>
              <h2>{currentCompany?.company_title}</h2>
            </Popup>
          </Marker>
          <Polygon
            positions={polygonCoords}
            pathOptions={{ 
              color: "#44e15f", 
              weight: 2,
              fillColor: "#44e15f",
              fillOpacity: 0.3 
            }}
          />
        </>
      )}
    </MapContainer>
  );
};

export default MapView;
