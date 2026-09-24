import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { I18nProvider } from '@/lib/i18n/context';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: 'FactoryLens',
  description: 'AI Inventory Checkout Agent',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <I18nProvider>
          <AuthProvider>
            <Nav />
            <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
