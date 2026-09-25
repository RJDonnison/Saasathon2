import ModuleView from './ModuleView.tsx'
import CodeEditor from './CodeEditor.tsx'
import ScratchPad from './ScratchPad.tsx'
import AiChatPanel from './AiChatPanel.tsx'
import RaiseHandButton from './RaiseHandButton.tsx'

export default function StudentHome() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ModuleView />
      <CodeEditor />
      <ScratchPad />
      <AiChatPanel />
      <RaiseHandButton />
    </div>
  )
}
