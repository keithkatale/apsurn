import { CopilotChat } from "@/components/copilot/CopilotChat";

export default function CopilotPage() {
  return (
    <div className="-m-8 h-[calc(100%+4rem)] overflow-hidden rounded-none border-neutral-200 bg-white">
      <CopilotChat />
    </div>
  );
}
