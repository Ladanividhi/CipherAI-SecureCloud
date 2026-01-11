import React, { createContext, useContext } from 'react';

const UserContext = createContext({ currentUser: null, idToken: '', authReady: false });

export const UserProvider = ({ value, children }) => (
  <UserContext.Provider value={value}>{children}</UserContext.Provider>
);

export const useUserContext = () => useContext(UserContext);
