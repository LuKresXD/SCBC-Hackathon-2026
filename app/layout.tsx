export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Senthos · Structured Predictions</title>
        <link rel="icon" type="image/png" href="/senthos_appicon_256_full.png" />
        <link rel="apple-touch-icon" href="/senthos_appicon_256_full.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}