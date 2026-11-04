import { HubScreen } from "@/components/screens/hub";

/** Create form, even when a session would otherwise show the circle list. */
export default function NewCirclePage() {
  const basePath = process.env.PINATA_BASE_PATH ?? "";
  return <HubScreen basePath={basePath} />;
}
