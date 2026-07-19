const ADDRESS = 'Rua José Freire Moura, 647 — Ponta Verde, Maceió/AL';
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  'Rua José Freire Moura, 647, Ponta Verde, Maceió, AL',
)}`;
const WHATSAPP_DISPLAY = '(82) 99657-2155';
const WHATSAPP_URL = 'https://wa.me/5582996572155';
const INSTAGRAM_HANDLE = 'bacalhaueciamaceio';

export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`mt-10 border-t-4 border-brand-gold bg-brand-red text-brand-cream ${className}`}
    >
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center justify-center gap-3">
          <img
            src="/logo.jpeg"
            alt="Restaurante Bacalhau & Cia"
            className="h-12 w-12 rounded-full"
          />
          <span className="font-display text-xl font-bold text-white">
            Bacalhau &amp; Cia
          </span>
        </div>

        <div className="mt-6 grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <h3 className="font-display font-bold text-brand-gold">
              📍 Endereço
            </h3>
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block hover:underline"
            >
              {ADDRESS}
            </a>
          </div>

          <div>
            <h3 className="font-display font-bold text-brand-gold">
              💬 Contato
            </h3>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block hover:underline"
            >
              WhatsApp {WHATSAPP_DISPLAY}
            </a>
            <a
              href={`https://instagram.com/${INSTAGRAM_HANDLE}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block hover:underline"
            >
              @{INSTAGRAM_HANDLE}
            </a>
          </div>

          <div>
            <h3 className="font-display font-bold text-brand-gold">
              🕐 Horário
            </h3>
            <p className="mt-1">Seg a Sáb: 10h às 22h</p>
            <p>Dom: 10h às 18h</p>
          </div>
        </div>
      </div>

      <p className="border-t border-white/15 py-3 text-center text-xs text-brand-cream/60">
        © {new Date().getFullYear()} Restaurante Bacalhau &amp; Cia
      </p>
    </footer>
  );
}
