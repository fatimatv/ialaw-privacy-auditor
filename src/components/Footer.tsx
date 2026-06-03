export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#dfe3ef] bg-[#011EF4] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="text-2xl font-black tracking-[0.22em]">IALAW</div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/85">
            Iriarte &amp; Asociados — colectivo de abogados especializado en la interrelación
            entre el Derecho, la tecnología y la Sociedad de la Información.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#FBBB02]">Contacto</h3>
          <address className="mt-4 space-y-2 text-sm not-italic leading-6 text-white/85">
            <div>Av. Enrique Palacios 360, Of. 612</div>
            <div>Miraflores, Lima — Perú</div>
            <div>
              <a href="tel:+5113996491" className="hover:text-[#FBBB02]">
                +51 1 399 6491
              </a>
            </div>
            <div>
              <a href="mailto:contacto@iriartelaw.com" className="hover:text-[#FBBB02]">
                contacto@iriartelaw.com
              </a>
            </div>
            <div>
              <a
                href="https://www.iriartelaw.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FBBB02]"
              >
                iriartelaw.com
              </a>
            </div>
          </address>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#FBBB02]">Redes</h3>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-white/85">
            <li>
              <a
                href="https://www.linkedin.com/company/iriarte-&-asociados/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FBBB02]"
              >
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href="https://x.com/ialaw"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FBBB02]"
              >
                X / Twitter
              </a>
            </li>
            <li>
              <a
                href="https://www.instagram.com/ialaw"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FBBB02]"
              >
                Instagram
              </a>
            </li>
            <li>
              <a
                href="https://www.facebook.com/ialaw"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FBBB02]"
              >
                Facebook
              </a>
            </li>
            <li>
              <a
                href="https://www.youtube.com/@IriarteLaw"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FBBB02]"
              >
                YouTube
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <span>© {new Date().getFullYear()} Iriarte &amp; Asociados. Todos los derechos reservados.</span>
          <span>Motor determinístico — no reemplaza la auditoría legal especializada.</span>
        </div>
      </div>
    </footer>
  );
}
