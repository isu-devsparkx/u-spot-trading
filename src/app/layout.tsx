import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import { WalletProvider } from '@/context/WalletContext';
import { AuthProvider } from '@/context/AuthContext';
import { OrderFlowToastProvider } from '@/context/OrderFlowToastContext';
import OrderFlowToastContainer from '@/components/dashboard/OrderFlowToastContainer';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'U-SPOT — Crypto Spot Signal & Strategy Research Platform',
  description:
    'A disciplined spot-trading research and signal platform. Scan crypto markets, generate BUY/SELL signals, manage risk, track outcomes, and evaluate strategy performance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="grid-bg min-h-screen" suppressHydrationWarning>
        <AuthProvider>
          <WalletProvider>
            <OrderFlowToastProvider>
              <Sidebar />
              <main className="lg:ml-64 min-h-screen flex flex-col justify-between">
                <div className="flex-1 flex flex-col">
                  {children}
                </div>
                <Footer />
              </main>
              <OrderFlowToastContainer />
            </OrderFlowToastProvider>
          </WalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
