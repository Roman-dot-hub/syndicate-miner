import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';

export function useTonConnect() {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  const connect = () => tonConnectUI.openModal();
  const disconnect = () => tonConnectUI.disconnect();

  return {
    connected:  !!wallet,
    address:    wallet?.account.address ?? null,
    connect,
    disconnect,
  };
}
