import { ChatDataProvider } from "@/components/ChatDataProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";

export default function RoomsLayout({ children }: LayoutProps<"/rooms">) {
  return (
    <RequireAuth>
      <ChatDataProvider>
        <div className="flex h-dvh min-h-0">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </ChatDataProvider>
    </RequireAuth>
  );
}
