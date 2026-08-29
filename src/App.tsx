/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TopAppBar } from './components/Layout/TopAppBar';
import { Sidebar, TabType } from './components/Layout/Sidebar';
import { DashboardView } from './components/Dashboard/DashboardView';
import { RDUnitsModule } from './components/RDUnits/RDUnitsModule';
import { ProtoUnitsModule } from './components/ProtoUnits/ProtoUnitsModule';
import { PpUnitsModule } from './components/PpUnits/PpUnitsModule';
import { ModelRegistrationScreen } from './components/PpUnits/ModelRegistrationScreen';
import { FieldUnitsModule } from './components/FieldUnits/FieldUnitsModule';
import { AddProtoUnitDialog } from './components/ProtoUnits/AddProtoUnitDialog';
import { AddPpUnitDialog } from './components/PpUnits/AddPpUnitDialog';
import { AddUnitDialog } from './components/RDUnits/AddUnitDialog';
import { TrackTimelineDialog } from './components/RDUnits/TrackTimelineDialog';
import { EditUnitDialog } from './components/RDUnits/EditUnitDialog';
import { playMeghaOverdueAlarm, speakMegha, startListening, stopListening, stopMeghaVoice, getVoiceStatus, getVoiceModeActive, registerMeghaUIHandlers, subscribeVoiceActiveState, setVoiceModeActive, unlockAudio } from './utils/meghaVoice';
import { checkAndSendOverdueMobileNotifications, requestMobileNotificationPermission } from './utils/mobileNotification';
import { SettingsModule } from './components/Settings/SettingsModule';
import { SmogModule } from './components/Smog/SmogModule';
import { ExportDataModule } from './components/ExportData/ExportDataModule';
import { AISupportModule } from './components/AISupport/AISupportModule';
import { ReportsModule } from './components/Reports/ReportsModule';
import { ReportRoomModule } from './components/ReportRoom/ReportRoomModule';
import { GraphModule } from './components/Graph/GraphModule';
import { MobileToastContainer } from './components/Layout/MobileToastContainer';
import { SupabaseSyncModal } from './components/Supabase/SupabaseSyncModal';
import { NoInternetModal } from './components/Common/NoInternetModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/Auth/LoginScreen';
import { AccessDeniedView } from './components/Auth/AccessDeniedView';
import { UserManagementModule } from './components/Admin/UserManagementModule';
import { FlaskConical, RefreshCw } from 'lucide-react';

import { Unit, UserProfile, DynamicUnitRow } from './types';

import { 
  getUnits, 
  getActivityLogs, 
  getNotifications, 
  subscribeUnitStore,
  addMultipleUnits,
  advanceUnitStage,
  reworkUnit,
  updateUnitDetails,
  deleteUnit,
  calculateRemainingDays
} from './services/unitStore';

export function MainApp() {
  const { user, isAuthenticated, isLoading, isAdmin, isRandom } = useAuth();

  // Theme state: default dark mode for industrial lab look & feel
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Navigation tab state: default 'dashboard' for Admin, 'rd-units' for Random
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Automatically ensure random user starts on permitted rd-units tab
  useEffect(() => {
    if (isRandom && activeTab !== 'rd-units') {
      setActiveTab('rd-units');
    }
  }, [isRandom]);

  // Mobile sidebar toggle
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState(false);

  // Store data state
  const [units, setUnits] = useState<Unit[]>(getUnits());
  const [activityLogs, setActivityLogs] = useState(getActivityLogs());
  const [notifications, setNotifications] = useState(getNotifications());


  // Modal dialog states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddProtoModalOpen, setIsAddProtoModalOpen] = useState(false);
  const [protoSection, setProtoSection] = useState<'live' | 'stopped' | 'finished'>('live');
  const [isAddPpModalOpen, setIsAddPpModalOpen] = useState(false);
  const [addPpInitialType, setAddPpInitialType] = useState<'IDU' | 'ODU' | 'BOTH'>('BOTH');
  const [ppSection, setPpSection] = useState<'live' | 'stopped' | 'finished'>('live');
  const [trackedUnit, setTrackedUnit] = useState<Unit | null>(null);
  const [editedUnit, setEditedUnit] = useState<Unit | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Preselected unit for Generate Report screen
  const [reportPreselectedSerial, setReportPreselectedSerial] = useState<string>('');
  const [reportPreselectedSource, setReportPreselectedSource] = useState<'proto' | 'pp'>('proto');

  // Megha Voice Active / Deactivated toggle state (Default: false until user activates)
  const [isMeghaVoiceActive, setIsMeghaVoiceActive] = useState<boolean>(() => getVoiceModeActive());

  // Keep isMeghaVoiceActive synced with meghaVoice utility state
  useEffect(() => {
    const unsubscribe = subscribeVoiceActiveState((active) => {
      setIsMeghaVoiceActive(active);
    });
    return unsubscribe;
  }, []);

  // Keyboard Shortcuts: Ctrl + Space to trigger voice command listening, Escape to stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') {
          stopListening();
        }
        return;
      }

      if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        unlockAudio();
        startListening(units);
      } else if (e.key === 'Escape') {
        stopListening();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [units]);

  // Toggle / Activate / Deactivate Megha AI Voice (Play / Pause)
  const handleToggleMeghaVoice = () => {
    unlockAudio();
    if (isMeghaVoiceActive || getVoiceStatus() !== 'idle') {
      // Pause Megha AI Voice (Turn Red / PAUSED) & stop any speech or listening
      setVoiceModeActive(false);
      stopListening();
    } else {
      // Play Megha AI Voice (Turn Green / PLAYING) & start listening to user's question
      setVoiceModeActive(true, units);
    }
  };

  // Automatic Mobile Push Notification check on units update
  useEffect(() => {
    // Check and send mobile push / browser notifications for overdue units
    checkAndSendOverdueMobileNotifications(units);
  }, [units]);

  // Register Megha Voice UI Handlers to enable complete voice control over the website
  useEffect(() => {
    registerMeghaUIHandlers({
      navigateToTab: (tab) => {
        if (['dashboard', 'rd-units', 'proto-units', 'pp-units', 'field-units', 'smog', 'reports', 'report-room', 'cs-report', 'ce-report', 'export-data', 'settings', 'ai-support'].includes(tab)) {
          setActiveTab(tab as TabType);
        }
      },
      openAddUnitModal: () => setIsAddModalOpen(true),
      openAddProtoModal: () => setIsAddProtoModalOpen(true),
      closeModals: () => {
        setIsAddModalOpen(false);
        setIsAddProtoModalOpen(false);
        setTrackedUnit(null);
        setEditedUnit(null);
      },
      toggleTheme: () => setTheme(prev => prev === 'light' ? 'dark' : 'light'),
      trackUnitBySerial: (serial) => {
        const allUnits = getUnits();
        const digits = serial.replace(/\D/g, '');
        const match = allUnits.find(u => u.serialNumber && digits && u.serialNumber.replace(/\D/g, '').includes(digits));
        if (match) {
          setTrackedUnit(match);
          setActiveTab('rd-units');
        } else if (allUnits.length > 0) {
          setTrackedUnit(allUnits[0]);
          setActiveTab('rd-units');
        }
      },
      clickPrimaryViewBtn: () => {
        const allUnits = getUnits();
        if (allUnits.length > 0) {
          setTrackedUnit(allUnits[0]);
          setActiveTab('rd-units');
        }
      }
    });
  }, []);


  // Active User Profile
  const [currentUser, setCurrentUser] = useState<UserProfile>({
    id: 'usr-1',
    name: 'Indrajit',
    email: 'indrajitsharma86566@gmail.com',
    role: 'Lab Manager',
    department: 'R&D',
    avatarUrl: ''
  });

  // Subscribe to reactive store changes and set up live timer ticker
  useEffect(() => {
    const unsubscribe = subscribeUnitStore(() => {
      setUnits(getUnits());
      setActivityLogs(getActivityLogs());
      setNotifications(getNotifications());
    });

    const timer = setInterval(() => {
      setUnits(getUnits());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  // Update root element class for dark mode styling
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handlers
  const handleToggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleChangeUserRole = (newRole: UserProfile['role']) => {
    let dept: UserProfile['department'] = 'R&D';
    if (newRole === 'BSR Specialist') dept = 'BSR';
    else if (newRole === 'ELT Engineer') dept = 'ELT';
    else if (newRole === 'OQC Inspector') dept = 'OQC';

    setCurrentUser(prev => ({
      ...prev,
      role: newRole,
      department: dept
    }));
  };

  const handleAddUnitsSubmit = async (
    rows: DynamicUnitRow[],
    requiredBy: string,
    dayDuration: number,
    bsrPerson: string,
    eltPerson: string,
    rdPerson: string
  ) => {
    await addMultipleUnits(rows, requiredBy, dayDuration, bsrPerson, eltPerson, rdPerson);
    setActiveTab('rd-units');
  };

  const handleAdvanceStage = async (unitId: string, performerName: string, remarks: string, nextStageIdx?: number) => {
    await advanceUnitStage(unitId, performerName, remarks, nextStageIdx);
    // Keep trackedUnit updated in modal
    if (trackedUnit && trackedUnit.id === unitId) {
      const updated = getUnits().find(u => u.id === unitId);
      if (updated) setTrackedUnit(updated);
    }
  };

  const handleReworkUnit = async (unitId: string, performerName: string, remarks: string) => {
    await reworkUnit(unitId, performerName, remarks);
    if (trackedUnit && trackedUnit.id === unitId) {
      const updated = getUnits().find(u => u.id === unitId);
      if (updated) setTrackedUnit(updated);
    }
  };

  const handleSaveEditUnit = async (unitId: string, updatedData: Partial<Unit>) => {
    await updateUnitDetails(unitId, updatedData);
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (window.confirm("Are you sure you want to delete this R&D unit from LLT Lab?")) {
      await deleteUnit(unitId);
    }
  };

  const liveUnitsCount = units.filter(u => u.status !== 'received' && u.status !== 'completed').length;
  const receivedUnitsCount = units.filter(u => u.status === 'received' || u.status === 'completed').length;

  // 1. Loading Screen while Firebase Auth initializes
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-cyan-950/60 mb-4 animate-pulse">
          <FlaskConical className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-300">
          <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Authenticating with Firebase Cloud...</span>
        </div>
        <p className="text-xs text-slate-500 font-mono mt-2">LLT LAB &bull; Role-Based Access Control</p>
      </div>
    );
  }

  // 2. Unauthenticated Screen -> Render Firebase Login Screen
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // 3. Security Guard: If Random role user attempts to navigate to restricted views
  const isTabUnauthorizedForRandom = isRandom && activeTab !== 'rd-units';

  return (
    <div className={`min-h-screen font-sans bg-slate-950 text-slate-100 flex flex-col ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Top App Bar */}
      <TopAppBar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isMeghaVoiceActive={isMeghaVoiceActive}
        onToggleMeghaVoice={handleToggleMeghaVoice}
        notifications={notifications}
        currentUser={currentUser}
        onChangeUserRole={handleChangeUserRole}
        onToggleSidebarMobile={() => setIsOpenMobileSidebar(!isOpenMobileSidebar)}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
      />

      {/* Main Container with Sidebar + Content */}
      <div className="flex-1 flex items-stretch">
        {/* Responsive Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isOpenMobile={isOpenMobileSidebar}
          onCloseMobile={() => setIsOpenMobileSidebar(false)}
          liveUnitsCount={liveUnitsCount}
          receivedUnitsCount={receivedUnitsCount}
          userRole={user?.role}
          onOpenAddPpModal={(type) => {
            setActiveTab('pp-units');
            if (type) setAddPpInitialType(type);
            setIsAddPpModalOpen(true);
          }}
        />

        {/* Workspace Canvas Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full overflow-hidden">
          
          {/* Access Denied Guard View for Random User */}
          {isTabUnauthorizedForRandom ? (
            <AccessDeniedView onRedirectToAllowed={() => setActiveTab('rd-units')} />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  units={units}
                  activityLogs={activityLogs}
                  notifications={notifications}
                  onNavigateToRDUnits={() => setActiveTab('rd-units')}
                  onNavigateToProtoUnits={() => setActiveTab('proto-units')}
                  onNavigateToPpUnits={() => setActiveTab('pp-units')}
                  onNavigateToFieldUnits={() => setActiveTab('field-units')}
                  onNavigateToSmog={() => setActiveTab('smog')}
                  onOpenAddUnitModal={() => setIsAddModalOpen(true)}
                />
              )}

              {activeTab === 'proto-units' && (
                <ProtoUnitsModule
                  defaultSection={protoSection}
                  onOpenAddModal={() => setIsAddProtoModalOpen(true)}
                  onNavigateToGenerateReport={(serialNo) => {
                    setReportPreselectedSerial(serialNo);
                    setReportPreselectedSource('proto');
                    setActiveTab('reports');
                  }}
                />
              )}

              {activeTab === 'pp-units' && (
                <PpUnitsModule
                  defaultSection={ppSection}
                  onOpenAddModal={() => setIsAddPpModalOpen(true)}
                />
              )}

              {(activeTab === 'pp-models' || activeTab === 'pp-add-idu' || activeTab === 'pp-add-odu') && (
                <ModelRegistrationScreen
                  initialUnitType={activeTab === 'pp-add-odu' ? 'ODU' : 'IDU'}
                  onNavigateToTesting={() => setActiveTab('pp-units')}
                />
              )}

              {activeTab === 'rd-units' && (
                <RDUnitsModule
                  units={units}
                  onOpenAddUnitModal={() => setIsAddModalOpen(true)}
                  onTrackUnit={(unit) => setTrackedUnit(unit)}
                  onEditUnit={(unit) => setEditedUnit(unit)}
                  onDeleteUnit={handleDeleteUnit}
                  onAdvanceStage={handleAdvanceStage}
                  onReworkUnit={handleReworkUnit}
                />
              )}

              {activeTab === 'field-units' && (
                <FieldUnitsModule
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                  }}
                />
              )}

              {activeTab === 'smog' && (
                <SmogModule
                  currentUser={currentUser}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                  }}
                />
              )}

              {(activeTab === 'reports' || activeTab === 'cs-report' || activeTab === 'ce-report') && (
                <ReportsModule
                  initialReportType={activeTab === 'ce-report' ? 'ce-report' : 'cs-report'}
                  initialSerialNo={reportPreselectedSerial}
                  initialUnitSource={reportPreselectedSource}
                  units={units}
                  onNavigateToDashboard={() => setActiveTab('dashboard')}
                  onNavigateToReportRoom={() => setActiveTab('report-room')}
                />
              )}

              {activeTab === 'report-room' && (
                <ReportRoomModule
                  onNavigateToReportSection={(subTab) => {
                    setActiveTab(subTab === 'reliability' ? 'ce-report' : 'cs-report');
                  }}
                  onNavigateToDashboard={() => setActiveTab('dashboard')}
                />
              )}

              {activeTab === 'graph' && (
                <GraphModule
                  currentUser={currentUser}
                />
              )}

              {activeTab === 'export-data' && (
                <ExportDataModule
                  units={units}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                  }}
                />
              )}

              {activeTab === 'ai-support' && (
                <AISupportModule
                  units={units}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsModule
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                  onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
                />
              )}

              {/* Admin User Management */}
              {activeTab === 'user-management' && (
                isAdmin ? (
                  <UserManagementModule 
                    onNavigateToDashboard={() => setActiveTab('dashboard')} 
                  />
                ) : (
                  <AccessDeniedView onRedirectToAllowed={() => setActiveTab('rd-units')} />
                )
              )}
            </>
          )}
        </main>
      </div>

      {/* Supabase Cloud Database Manager Modal */}
      <SupabaseSyncModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />

      {/* Proto Unit Add Modal */}
      <AddProtoUnitDialog
        isOpen={isAddProtoModalOpen}
        onClose={() => setIsAddProtoModalOpen(false)}
        onSuccess={(status) => {
          setProtoSection(status === 'stopped' ? 'stopped' : 'live');
          setActiveTab('proto-units');
        }}
      />

      {/* PP Unit Add Modal */}
      <AddPpUnitDialog
        isOpen={isAddPpModalOpen}
        initialUnitType={addPpInitialType}
        onClose={() => setIsAddPpModalOpen(false)}
        onSuccess={(status) => {
          setPpSection(status === 'stopped' ? 'stopped' : 'live');
          setActiveTab('pp-units');
        }}
      />

      {/* Full-Screen / Responsive Add Unit Dialog */}
      <AddUnitDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddUnitsSubmit}
      />

      {/* Track Timeline Dialog */}
      <TrackTimelineDialog
        unit={trackedUnit}
        isOpen={Boolean(trackedUnit)}
        onClose={() => setTrackedUnit(null)}
        onAdvanceStage={handleAdvanceStage}
        onReworkUnit={handleReworkUnit}
      />

      {/* Edit Unit Dialog */}
      <EditUnitDialog
        unit={editedUnit}
        isOpen={Boolean(editedUnit)}
        onClose={() => setEditedUnit(null)}
        onSave={handleSaveEditUnit}
      />

      {/* Floating Mobile Notification Toast Banner */}
      <MobileToastContainer />

      {/* Global No Internet Connection Guard Modal */}
      <NoInternetModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

