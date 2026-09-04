import { ArrowLeft, Mail, Sparkles } from 'lucide-react';
import { useEffect } from 'react';

const CONTACT_EMAIL = 'hello@wornlabelsociety.co.nz';

export default function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy | MarketingOS';
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B]">
      <header className="border-b border-[#E4E4E7] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 sm:px-8">
          <a href="/" className="inline-flex items-center gap-3" aria-label="Back to MarketingOS">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#09090B] text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">MarketingOS</span>
              <span className="block text-[11px] text-[#71717A]">Creative operating system</span>
            </span>
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[#71717A] transition hover:text-[#09090B]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            MarketingOS
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
        <article className="rounded-2xl border border-[#E4E4E7] bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-12">
          <header className="border-b border-[#E4E4E7] pb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#71717A]">
              MarketingOS
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
            <p className="mt-3 text-sm text-[#71717A]">Last updated: 5 September 2026</p>
          </header>

          <div className="mt-8 max-w-none text-[15px] leading-7 text-[#27272A] [&>h2]:mt-10 [&>h2]:border-t [&>h2]:border-[#F4F4F5] [&>h2]:pt-8 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:tracking-tight [&>p]:mt-4 [&>p:first-child]:mt-0 [&>ul]:mt-4 [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-6">
            <p>
              MarketingOS (“MOS”) is a marketing operating system operated by Worn Label Society in New Zealand.
            </p>
            <p>
              This Privacy Policy explains how MarketingOS collects, uses, stores and handles information when you use the MarketingOS platform or connect third-party services such as Facebook and Instagram.
            </p>

            <h2>1. Information we collect</h2>
            <p>
              MarketingOS may collect information that you provide directly when using the platform, including your name, email address, business or brand information, marketing preferences, campaign information, content and other information you choose to enter into the service.
            </p>
            <p>
              When you connect a third-party platform such as Facebook or Instagram, MarketingOS may also receive information made available through that platform&apos;s authorised APIs.
            </p>
            <p>Depending on the permissions you grant, this may include information about:</p>
            <ul>
              <li>Facebook Pages you manage;</li>
              <li>connected Instagram professional accounts;</li>
              <li>Page or account identifiers;</li>
              <li>published posts and media;</li>
              <li>content required to publish posts on your behalf;</li>
              <li>engagement, insights and performance information; and</li>
              <li>information necessary to maintain and manage the authorised connection.</li>
            </ul>
            <p>MarketingOS only requests access required to provide the features you choose to use.</p>

            <h2>2. Facebook and Instagram connections</h2>
            <p>MarketingOS uses Meta&apos;s authorised APIs to provide Facebook and Instagram functionality.</p>
            <p>
              When you choose to connect Meta to MarketingOS, you will be directed to Meta to authenticate your account and approve the permissions requested by MarketingOS.
            </p>
            <p>MarketingOS currently uses Meta permissions to enable functionality such as:</p>
            <ul>
              <li>identifying Facebook Pages available to the authorised user;</li>
              <li>identifying eligible connected Instagram accounts;</li>
              <li>publishing authorised content to Facebook Pages;</li>
              <li>publishing authorised content to Instagram;</li>
              <li>reading Page engagement and content performance information; and</li>
              <li>maintaining the connection between MarketingOS and the selected Meta destinations.</li>
            </ul>
            <p>
              MarketingOS will not publish content to a Facebook Page or Instagram account unless that account has been connected and the relevant publishing action has been authorised through the MarketingOS workflow.
            </p>

            <h2>3. Access tokens and credentials</h2>
            <p>
              When you connect an external platform, MarketingOS may receive access tokens or other credentials required to communicate with that platform.
            </p>
            <p>These credentials are used only to provide the connected functionality you have authorised.</p>
            <p>MarketingOS does not intentionally expose access tokens or platform credentials to other MarketingOS users.</p>
            <p>
              You can disconnect a connected Meta account through MarketingOS. Access may also be revoked through your Facebook or Meta account settings.
            </p>

            <h2>4. How we use information</h2>
            <p>We use information processed through MarketingOS to:</p>
            <ul>
              <li>operate and maintain the platform;</li>
              <li>create and manage brand workspaces;</li>
              <li>create, plan and manage marketing campaigns;</li>
              <li>generate and manage marketing content and creative assets;</li>
              <li>schedule and publish authorised content;</li>
              <li>connect MarketingOS with authorised third-party platforms;</li>
              <li>retrieve marketing and content performance information;</li>
              <li>improve the reliability and functionality of MarketingOS;</li>
              <li>troubleshoot technical issues; and</li>
              <li>protect the platform against misuse or unauthorised activity.</li>
            </ul>
            <p>We do not sell personal information.</p>

            <h2>5. Artificial intelligence services</h2>
            <p>
              MarketingOS may use artificial intelligence services to assist with marketing planning, content generation, revisions and other creative functions.
            </p>
            <p>
              Information relevant to a requested AI function may be processed by third-party AI service providers where necessary to provide that function.
            </p>
            <p>We aim to send only information reasonably required to perform the requested service.</p>

            <h2>6. Third-party services</h2>
            <p>
              MarketingOS relies on third-party service providers to operate parts of the platform. These may include hosting, database, storage, artificial intelligence and social-media platform providers.
            </p>
            <p>
              These providers may process information as necessary to deliver their services and are subject to their own terms and privacy practices.
            </p>
            <p>
              Connecting MarketingOS to a third-party platform is optional. Your use of Facebook, Instagram and other external platforms also remains subject to the privacy policies and terms of those providers.
            </p>

            <h2>7. Storage and retention</h2>
            <p>
              We retain information for as long as reasonably necessary to operate MarketingOS, provide requested functionality, meet legitimate business or legal requirements, and maintain appropriate business records.
            </p>
            <p>Information that is no longer required may be deleted or anonymised where appropriate.</p>
            <p>
              The length of time particular information is retained may depend on the nature of the information and the service for which it was collected.
            </p>

            <h2>8. Disconnecting Facebook or Instagram</h2>
            <p>You may disconnect a Meta integration from MarketingOS using the available connection controls within the platform.</p>
            <p>You may also revoke MarketingOS access through your Facebook or Meta account settings.</p>
            <p>
              Disconnecting an integration prevents MarketingOS from using that connection for future API requests, subject to any information that must reasonably be retained for legal, security or record-keeping purposes.
            </p>

            <h2>9. Data deletion requests</h2>
            <p>
              You may request deletion of personal information or information associated with a connected Meta account by contacting:
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-[#71717A]" />
              <a className="font-medium text-[#09090B] underline decoration-[#D4D4D8] underline-offset-4 hover:decoration-[#09090B]" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>Please include enough information for us to identify the relevant MarketingOS account or workspace.</p>
            <p>
              We may need to verify your identity or authority over the relevant account before completing a deletion request.
            </p>
            <p>
              Where appropriate, we will delete or anonymise information associated with the request, subject to information we are required or reasonably entitled to retain.
            </p>
            <p>
              Detailed instructions are also available on the MarketingOS Data Deletion page.
            </p>

            <h2>10. Security</h2>
            <p>
              We take reasonable technical and organisational measures designed to protect information handled through MarketingOS from unauthorised access, loss, misuse or disclosure.
            </p>
            <p>No online service or method of electronic storage can guarantee absolute security.</p>

            <h2>11. Your privacy rights</h2>
            <p>
              Depending on the laws that apply to you, you may have rights relating to access, correction or deletion of your personal information.
            </p>
            <p>MarketingOS is operated from New Zealand and handles personal information in accordance with applicable New Zealand privacy requirements.</p>
            <p>To request access to or correction of personal information held about you, contact us using the details below.</p>

            <h2>12. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy as MarketingOS develops or where our legal, technical or operational requirements change.
            </p>
            <p>
              The current version will be published on this page and the “Last updated” date will be updated when material changes are made.
            </p>

            <h2>13. Contact</h2>
            <p>For privacy enquiries, requests or concerns relating to MarketingOS, contact:</p>
            <p>MarketingOS / Worn Label Society</p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-[#71717A]" />
              <span>
                Email:{' '}
                <a className="font-medium text-[#09090B] underline decoration-[#D4D4D8] underline-offset-4 hover:decoration-[#09090B]" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
              </span>
            </p>
            <p>New Zealand</p>
          </div>
        </article>
      </main>

      <footer className="mx-auto flex max-w-3xl items-center justify-between px-6 pb-10 text-xs text-[#71717A] sm:px-8">
        <span>© MarketingOS / Worn Label Society</span>
        <a href="/privacy" className="font-medium text-[#09090B] hover:underline">
          Privacy
        </a>
      </footer>
    </div>
  );
}