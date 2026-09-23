export const metadata = {
  title: 'FactoryLens',
  description: 'AI Inventory Checkout Agent — backend',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
