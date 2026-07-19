import type { Metadata } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Tipografia arredondada, no espírito das letras do logo.
const display = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
});
const body = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Bacalhau & Cia',
  description: 'Peça pelo nosso cardápio online',
  icons: { icon: '/logo.jpeg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
