import { createContext, useContext } from 'react';

export type Popup = 'account' | 'login' | null;
type Ui = { setPopup: (p: Popup) => void; openSidebar: () => void };
export const UiCtx = createContext<Ui>({ setPopup: () => {}, openSidebar: () => {} });
export const useUi = () => useContext(UiCtx);
