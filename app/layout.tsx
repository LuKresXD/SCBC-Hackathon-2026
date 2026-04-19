import { WalletProviders } from "./_providers/WalletProviders";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Senthos · Structured Predictions</title>
        <link rel="icon" type="image/png" href="/senthos_appicon_256_full.png" />
        <link rel="apple-touch-icon" href="/senthos_appicon_256_full.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
        <style>{`
          *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: #05080c;
            color: #eef2f7;
            font-family: 'Inter', system-ui, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(45, 212, 191, 0.15); border-radius: 2px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(45, 212, 191, 0.3); }
          a { color: inherit; }
          input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
          input[type=range] { accent-color: #0d9488; }
        `}</style>
      </head>
      <body><WalletProviders>{children}</WalletProviders></body>
    </html>
  );
}
