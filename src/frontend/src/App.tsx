import React from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { DashboardShell } from './components/DashboardShell';

export const App: React.FC = () => {
  return (
    <ProjectProvider>
      <DashboardShell />
    </ProjectProvider>
  );
};

export default App;
