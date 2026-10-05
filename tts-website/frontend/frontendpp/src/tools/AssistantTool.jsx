import AssistantChat from '../components/ai/AssistantChat';
import { Panel } from '../components/ui/Primitives';

export default function AssistantTool() {
  return (
    <Panel title="AI Assistant" hint="A helpful companion for creative work and toolkit questions">
      <AssistantChat />
    </Panel>
  );
}
