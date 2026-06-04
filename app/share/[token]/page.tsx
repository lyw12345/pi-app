import { SharedConversationView } from "@/components/SharedConversationView";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedConversationView token={token} />;
}
