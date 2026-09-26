import ModuleList from "./ModuleList.tsx";
import ScratchPad from "./ScratchPad.tsx";
import AiChatPanel from "./AiChatPanel.tsx";
import RaiseHandButton from "./RaiseHandButton.tsx";
import IDE from "../editor/IDE.tsx";

export default function StudentHome() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ModuleList />
      <IDE />
      <ScratchPad />
      <AiChatPanel />
      <RaiseHandButton />
    </div>
  );
}
