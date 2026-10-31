export default function RoomsHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-medium">Pick a room</p>
      <p className="max-w-sm text-sm text-zinc-500">
        Choose a room from the sidebar, or create a new one and add teammates by their user ID.
      </p>
    </div>
  );
}
