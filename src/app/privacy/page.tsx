import { PrivacyRequestForm } from "@/components/privacy/PrivacyRequestForm";
export default function PrivacyPage() {
  return <main className="mx-auto max-w-2xl px-6 py-16"><h1 className="text-2xl font-semibold">Data rights</h1><p className="mt-4 text-neutral-700">Apsurn indexes professional information from public sources for business-to-business use. Request access, correction, deletion, or permanent suppression below. We verify requests before changing a record and retain only a one-way suppression hash after suppression.</p><PrivacyRequestForm /></main>;
}
