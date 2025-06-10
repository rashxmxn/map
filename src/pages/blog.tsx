import MapView from "@/components/MapView";
import { title } from "@/components/primitives";
import DefaultLayout from "@/layouts/default";
import { MapContainer } from "react-leaflet";

export default function DocsPage() {
  return (
    <DefaultLayout>
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
        <div className="bg-red-300 w-full h-full">
          <MapView />

        </div>
      </section>
    </DefaultLayout>
  );
}
