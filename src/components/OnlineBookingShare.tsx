import React, { useState } from 'react';
import { Company } from '../data/mockData';
import { Share2, Copy, ExternalLink, Check, Calendar } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, cx } from './ui';
import { buttonSizes, buttonVariants } from './ui/Button';

interface OnlineBookingShareProps {
  company: Company;
}

export default function OnlineBookingShare({ company }: OnlineBookingShareProps) {
  const [copiado, setCopiado] = useState(false);
  const bookingUrl = `${window.location.origin}/agendar?clinica=${company.id}`;

  const handleCopiar = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleCompartir = () => {
    if ((navigator as any).share) {
      (navigator as any).share({
        title: `Agendar cita en ${company.nombreComercial}`,
        text: `Reserva tu cita en línea con ${company.nombreComercial}`,
        url: bookingUrl
      }).catch(() => {});
    } else {
      handleCopiar();
    }
  };

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-ink" aria-hidden="true" />
              Reservas en línea
            </span>
          }
          description="Comparte este enlace con tus pacientes para que agenden su cita por su cuenta, sin necesidad de llamar."
        />
        <CardBody className="space-y-5">
          <div className="bg-surface-muted border border-border rounded-control p-4">
            <span className="block text-fg-muted text-caption font-semibold uppercase tracking-wide mb-1.5">Enlace de {company.nombreComercial}</span>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-body text-brand-ink break-all underline-offset-2 hover:underline"
            >
              {bookingUrl}
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={handleCopiar}
              icon={copiado ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            >
              {copiado ? 'Copiado' : 'Copiar enlace'}
            </Button>
            <Button variant="outline" onClick={handleCompartir} icon={<Share2 className="w-4 h-4" aria-hidden="true" />}>
              Compartir
            </Button>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className={cx(
                'inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap transition-colors',
                buttonVariants.ghost,
                buttonSizes.md
              )}
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Ver página
            </a>
          </div>
          <p className="sr-only" role="status">{copiado ? 'Enlace copiado al portapapeles' : ''}</p>
        </CardBody>
      </Card>
    </div>
  );
}
