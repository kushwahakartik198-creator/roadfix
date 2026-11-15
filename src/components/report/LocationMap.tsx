import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

interface LocationMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  onTilesUnavailable: () => void;
}

function LocationPicker({ lat, lng, onChange }: Pick<LocationMapProps, "lat" | "lng" | "onChange">) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { animate: false });
  }, [lat, lng, map]);

  useMapEvents({
    click: (event) => onChange(event.latlng.lat, event.latlng.lng),
  });

  return <Marker position={[lat, lng]}><Popup>Reported location</Popup></Marker>;
}

export default function LocationMap({ lat, lng, onChange, onTilesUnavailable }: LocationMapProps) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        eventHandlers={{ tileerror: onTilesUnavailable }}
      />
      <LocationPicker lat={lat} lng={lng} onChange={onChange} />
    </MapContainer>
  );
}
