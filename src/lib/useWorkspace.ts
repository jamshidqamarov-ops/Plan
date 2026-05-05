import { useEffect, useState } from 'react';
import { db, auth, loginWithGoogle } from './firebase';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Employee, Project, Location, DayRequirements, ConstraintType, ShiftType } from './autoSchedule';

export interface WorkspaceData {
  ownerId: string;
  members: string[];
  globalMaxConsecutiveShifts: number;
  globalMaxConsecutiveDaysOff: number;
  employees: Employee[];
  projects: Project[];
  locations: Location[];
  requirements: Record<string, Record<string, Record<number, DayRequirements>>>;
  constraints: Record<string, ConstraintType>;
  schedule: Record<string, ShiftType | null>;
}

export function useWorkspace(workspaceId: string | null) {
  const [user, setUser] = useState(auth.currentUser);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return auth.onAuthStateChanged(setUser);
  }, []);

  useEffect(() => {
    if (!user || !workspaceId) {
      setLoading(false);
      setData(null);
      return;
    }

    const ref = doc(db, 'workspaces', workspaceId);
    
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        setData(snapshot.data() as WorkspaceData);
      } else {
        // Create default workspace if user is owner
        const defaultData: WorkspaceData = {
          ownerId: user.uid,
          members: [user.uid],
          globalMaxConsecutiveShifts: 3,
          globalMaxConsecutiveDaysOff: 2,
          employees: [],
          projects: [{ id: 'p1', name: 'Проект по умолчанию' }],
          locations: [{ id: 'l1', name: 'Локация по умолчанию', maxDesks: 10 }],
          requirements: {},
          constraints: {},
          schedule: {}
        };
        setDoc(ref, defaultData).catch(console.error);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, workspaceId]);

  const updateData = async (updates: Partial<WorkspaceData>) => {
    if (!workspaceId || !user) return;
    try {
      if (!data) return; // optimism fallback
      setData(prev => prev ? { ...prev, ...updates } : prev);
      await updateDoc(doc(db, 'workspaces', workspaceId), updates);
    } catch(err) {
      console.error(err);
    }
  }

  return { user, data, loading, loginWithGoogle, updateData };
}
