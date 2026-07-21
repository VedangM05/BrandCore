import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { TabId, Campaign, CampaignBrief, DnaResults } from '../types';
import { Sidebar } from './layout/Sidebar';
import { WorkspaceHeader } from './layout/WorkspaceHeader';
import { AppFooter } from './layout/AppFooter';
import { CampaignsView } from './views/CampaignsView';
import { CampaignDetailView } from './views/CampaignDetailView';
import { BusinessDnaView } from './views/BusinessDnaView';
import { PhotoshootView } from './views/PhotoshootView';
import { BriefWriterView } from './views/BriefWriterView';
import { AssetsLibraryView } from './views/AssetsLibraryView';
import { SettingsView } from './views/SettingsView';
import { Spinner } from './ui/Spinner';

export const DashboardShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { projects, activeProject, selectProject, error, isLoading } = useProject();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const [activeTab, setActiveTab] = useState<TabId>('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isScanningDna, setIsScanningDna] = useState(false);
  const [dnaResults, setDnaResults] = useState<DnaResults | null>(null);

  const [photoshootStyle, setPhotoshootStyle] = useState('Studio');
  const [scenePrompt, setScenePrompt] = useState('');
  const [isGeneratingPhoto, setIsGeneratingPhoto] = useState(false);
  const [generatedPhoto, setGeneratedPhoto] = useState<string | null>(null);

  const [campaignPrompt, setCampaignPrompt] = useState('');
  const [campaignCopy, setCampaignCopy] = useState<CampaignBrief | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab !== 'campaigns') {
      setSelectedCampaign(null);
    }
  };

  const handleDnaScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl) return;
    setIsScanningDna(true);
    setDnaResults(null);
    try {
      const response = await fetch('/api/dna/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to scan website DNA');
      }
      const data = await response.json();
      setDnaResults({
        brandName: data.title || websiteUrl.replace(/https?:\/\/(www\.)?/, '').split('.')[0].toUpperCase(),
        colors: data.colors && data.colors.length > 0 ? data.colors : ['#4f46e5', '#f97316', '#0ea5e9', '#10b981'],
        tone: data.tone || 'Modern, Professional, and Innovative',
        font: data.font_pairings || 'Plus Jakarta Sans & Inter',
      });
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during DNA scanning.');
    } finally {
      setIsScanningDna(false);
    }
  };

  const handlePhotoGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingPhoto(true);
    setGeneratedPhoto(null);
    setTimeout(() => {
      setIsGeneratingPhoto(false);
      setGeneratedPhoto(
        `Generated a high-fidelity image using the "${photoshootStyle}" theme based on prompt: "${scenePrompt || 'Minimalist studio setup'}"`
      );
    }, 1200);
  };

  const handleBriefGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingBrief(true);
    setCampaignCopy(null);
    setTimeout(() => {
      setIsGeneratingBrief(false);
      setCampaignCopy({
        headline: 'Launch your next campaign with confidence',
        body: 'Structured messaging, channel-ready assets, and a clear timeline — all from one workspace.',
        social: 'Plan smarter. Ship faster. BrandCore keeps your campaigns on track.',
      });
    }, 800);
  };

  const renderActiveView = () => {
    if (activeTab === 'campaigns') {
      if (selectedCampaign) {
        return (
          <CampaignDetailView
            campaign={selectedCampaign}
            onBack={() => setSelectedCampaign(null)}
          />
        );
      }
      return (
        <CampaignsView
          campaignPrompt={campaignPrompt}
          campaignCopy={campaignCopy}
          isGenerating={isGeneratingBrief}
          onPromptChange={setCampaignPrompt}
          onGenerate={handleBriefGenerate}
          onSelectCampaign={setSelectedCampaign}
        />
      );
    }

    switch (activeTab) {
      case 'dna':
        return (
          <BusinessDnaView
            websiteUrl={websiteUrl}
            isScanning={isScanningDna}
            results={dnaResults}
            onUrlChange={setWebsiteUrl}
            onScan={handleDnaScan}
          />
        );
      case 'photoshoot':
        return (
          <PhotoshootView
            style={photoshootStyle}
            scenePrompt={scenePrompt}
            isGenerating={isGeneratingPhoto}
            generatedPhoto={generatedPhoto}
            onStyleChange={setPhotoshootStyle}
            onPromptChange={setScenePrompt}
            onGenerate={handlePhotoGenerate}
          />
        );
      case 'creator':
        return <BriefWriterView />;
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
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <WorkspaceHeader
          projects={projects}
          activeProject={activeProject}
          onSelectProject={selectProject}
          userEmail={user?.email}
          onLogout={handleLogout}
        />

        {error && (
          <div
            role="alert"
            className="bg-red-50 border-b border-red-200 text-red-800 px-6 py-2.5 text-sm shrink-0"
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-6 py-8 workspace-container" data-testid="workspace-container">
          <div className="max-w-6xl mx-auto">
            <div className="sr-only">
              <h1>{activeProject?.name}</h1>
              <p>{activeProject?.description}</p>
            </div>

            {children || renderActiveView()}
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
};
