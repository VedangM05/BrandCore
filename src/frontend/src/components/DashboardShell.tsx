import React, { useRef, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { TabId, DnaResults } from '../types';
import { Sidebar } from './layout/Sidebar';
import { WorkspaceHeader } from './layout/WorkspaceHeader';
import { AppFooter } from './layout/AppFooter';
import { Spinner } from './ui/Spinner';
import { VerifyEmailBanner } from './auth/VerifyEmailBanner';
import { apiRequestJson } from '../api/client';
import { prefersReducedMotion } from '../lib/motion';

// Code-split per tab (React.lazy) instead of shipping every view - and
// everything they pull in, notably Konva for the asset editor - in the
// single ~1MB main bundle every user downloads on login regardless of
// which tabs they ever open. Each view still only has a named export, so
// each import() is remapped to the { default } shape React.lazy expects,
// rather than touching every view file just to add one.
const CoordinatorView = lazy(() => import('./views/CoordinatorView').then((m) => ({ default: m.CoordinatorView })));
const CampaignsView = lazy(() => import('./views/CampaignsView').then((m) => ({ default: m.CampaignsView })));
const BusinessDnaView = lazy(() => import('./views/BusinessDnaView').then((m) => ({ default: m.BusinessDnaView })));
const PhotoshootView = lazy(() => import('./views/PhotoshootView').then((m) => ({ default: m.PhotoshootView })));
const AssetsLibraryView = lazy(() => import('./views/AssetsLibraryView').then((m) => ({ default: m.AssetsLibraryView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })));

export const DashboardShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { projects, activeProject, selectProject, addScannedBrand, error, isLoading } = useProject();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const [activeTab, setActiveTab] = useState<TabId>('campaigns');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !viewRef.current) return;
      gsap.fromTo(
        viewRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
      );
    },
    { dependencies: [activeTab] }
  );

  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isScanningDna, setIsScanningDna] = useState(false);
  const [dnaResults, setDnaResults] = useState<DnaResults | null>(null);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
  };

  const handleDnaScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl) return;
    setIsScanningDna(true);
    setDnaResults(null);
    try {
      const data = await apiRequestJson<{
        id?: string;
        title?: string;
        colors?: string[];
        tone?: string;
        font_pairings?: string;
        tagline?: string;
        mission?: string;
        audience?: string;
        value_proposition?: string;
        logo_url?: string;
        site_images?: { url: string; alt: string }[];
      }>('/api/dna/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const extractedBrandName = data.title || websiteUrl.replace(/https?:\/\/(www\.)?/, '').split('.')[0].toUpperCase();
      const extractedColors = data.colors && data.colors.length > 0 ? data.colors : ['#4f46e5', '#f97316', '#0ea5e9', '#10b981'];
      const extractedTone = data.tone || 'Modern, Professional, and Innovative';
      const extractedFont = data.font_pairings || 'Plus Jakarta Sans & Inter';

      const resultsPayload = {
        id: data.id,
        brandName: extractedBrandName,
        colors: extractedColors,
        tone: extractedTone,
        font: extractedFont,
        tagline: data.tagline,
        mission: data.mission,
        audience: data.audience,
        valueProposition: data.value_proposition,
        logoUrl: data.logo_url,
        siteImages: data.site_images,
      };

      setDnaResults(resultsPayload);

      addScannedBrand({
        url: websiteUrl,
        brandName: extractedBrandName,
        colors: extractedColors,
        font: extractedFont,
        tone: extractedTone,
        tagline: data.tagline,
      });
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during DNA scanning.');
    } finally {
      setIsScanningDna(false);
    }
  };

  // Fired when the user corrects the auto-extracted DNA in BusinessDnaView
  // (see updateBrandDna in api/client.ts) - keeps this component's copy and
  // the workspace's active project in sync with the correction immediately,
  // no re-scan required.
  const handleDnaUpdated = (updated: DnaResults) => {
    setDnaResults(updated);
    if (websiteUrl) {
      addScannedBrand({
        url: websiteUrl,
        brandName: updated.brandName,
        colors: updated.colors,
        font: updated.font,
        tone: updated.tone,
        tagline: updated.tagline,
      });
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'coordinator':
        return <CoordinatorView />;
      case 'campaigns':
        return <CampaignsView />;
      case 'dna':
        return (
          <BusinessDnaView
            websiteUrl={websiteUrl}
            isScanning={isScanningDna}
            results={dnaResults}
            onDnaUpdated={handleDnaUpdated}
            onUrlChange={setWebsiteUrl}
            onScan={handleDnaScan}
          />
        );
      case 'photoshoot':
        return <PhotoshootView />;
      case 'library':
        return <AssetsLibraryView />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-bg">
        <Spinner label="Loading workspace..." />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans overflow-hidden">
      <a href="#dashboard-main" className="skip-link">Skip to content</a>
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isMobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <WorkspaceHeader
          projects={projects}
          activeProject={activeProject}
          onSelectProject={selectProject}
          userEmail={user?.email}
          onLogout={handleLogout}
          onMenuClick={() => setMobileNavOpen(true)}
        />

        <VerifyEmailBanner />

        {error && (
          <div
            role="alert"
            className="bg-state-danger border-b border-[#F3C6C6] text-state-danger-text px-6 py-2.5 text-sm shrink-0"
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <main id="dashboard-main" className="flex-1 overflow-y-auto px-6 py-8 workspace-container" data-testid="workspace-container">
          <div className="max-w-6xl mx-auto">
            <div className="sr-only">
              <h1>{activeProject?.name}</h1>
              <p>{activeProject?.description}</p>
            </div>

            <div ref={viewRef}>
              <Suspense fallback={<Spinner label="Loading..." />}>
                {children || renderActiveView()}
              </Suspense>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
};
