import ModuleView from "./ModuleView.tsx";
import ScratchPad from "./ScratchPad.tsx";
import AiChatPanel from "./AiChatPanel.tsx";
import RaiseHandButton from "./RaiseHandButton.tsx";
import IDE from "../editor/IDE.tsx";

export default function StudentHome() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ModuleView />
      <IDE />
      <ScratchPad />
      <AiChatPanel />
      <RaiseHandButton />
    </div>
  );
}
