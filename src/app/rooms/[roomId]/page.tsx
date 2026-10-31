import { Suspense } from "react";
import { RoomView } from "@/components/RoomView";
import { Spinner } from "@/components/Spinner";

// RoomView reads the room id with useParams(), which suspends during prerendering
// (the id is only known at request time), so it needs a Suspense boundary.
export default function RoomPage() {
  return (
    <Suspense fallback={<Spinner label="Opening room…" />}>
      <RoomView />
    </Suspense>
  );
}
