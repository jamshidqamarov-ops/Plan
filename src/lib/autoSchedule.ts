export type ShiftType = '12д' | '12н';
export type ConstraintType = 'must_work_12д' | 'must_work_12н' | 'must_off' | 'vacation' | 'sick' | null;
export type ShiftPreference = 'standard' | 'only_day' | 'only_night' | 'prefer_day' | 'prefer_night' | 'day_weekends_only';

export interface Project {
  id: string;
  name: string;
}

export interface Location {
  id: string;
  name: string;
  maxDesks: number;
  maxDesksWeekend?: number;
}

export interface Employee {
  id: string;
  name: string;
  projectId: string;
  locationId: string;
  maxConsecutiveShifts?: number;
  shiftPreference?: ShiftPreference;
}

export interface DayRequirements {
  D: number;
  N: number;
}

export interface ScheduleState {
  requirements: Record<string, Record<number, DayRequirements>>;
  constraints: Record<string, ConstraintType>; // `${empId}-${day}` -> ConstraintType
  schedule: Record<string, ShiftType | null>; // `${empId}-${day}` -> ShiftType | null
}

export function generateSchedule(
  employees: Employee[],
  locations: Location[],
  monthKey: string,
  daysInMonth: number,
  requirements: Record<string, Record<number, DayRequirements>>,
  constraints: Record<string, ConstraintType>,
  existingSchedule: Record<string, ShiftType | null>,
  globalMaxConsecutiveShifts: number
): Record<string, ShiftType | null> {
  const newSchedule: Record<string, ShiftType | null> = { ...existingSchedule };
  
  const shiftCount: Record<string, number> = {};
  const consecutive: Record<string, number> = {};
  const prevShift: Record<string, ShiftType | null> = {};

  for (const emp of employees) {
    shiftCount[emp.id] = 0;
    consecutive[emp.id] = 0;
    prevShift[emp.id] = null;
  }

  const [year, month] = monthKey.split('-').map(Number);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    const assignedByProj: Record<string, { D: number, N: number }> = {};
    const locUsageByShift: Record<string, { D: number, N: number }> = {};
    
    locations.forEach(l => locUsageByShift[l.id] = { D: 0, N: 0 });
    
    const getUsage = (locId: string) => {
        if (!locUsageByShift[locId]) locUsageByShift[locId] = { D: 0, N: 0 };
        return locUsageByShift[locId];
    };
    const getLimit = (locId: string, isWknd: boolean) => {
      const l = locations.find(loc => loc.id === locId);
      if (!l) return 999;
      return (isWknd && typeof l.maxDesksWeekend === 'number' && !isNaN(l.maxDesksWeekend)) ? l.maxDesksWeekend : l.maxDesks;
    };

    const availableEmployees: Employee[] = [];

    // First pass: assign mandatory workers, filter out mandatory off
    for (const emp of employees) {
      if (!assignedByProj[emp.projectId]) assignedByProj[emp.projectId] = { D: 0, N: 0 };
      
      const key = `${emp.id}-${monthKey}-${day}`;
      const constraint = constraints[key];

      if (constraint === 'must_work_12д') {
        newSchedule[key] = '12д';
        assignedByProj[emp.projectId].D++;
        getUsage(emp.locationId).D++;
        shiftCount[emp.id]++;
      } else if (constraint === 'must_work_12н') {
        newSchedule[key] = '12н';
        assignedByProj[emp.projectId].N++;
        getUsage(emp.locationId).N++;
        shiftCount[emp.id]++;
      } else if (constraint === 'must_off' || constraint === 'vacation' || constraint === 'sick') {
        newSchedule[key] = null;
      } else {
        newSchedule[key] = null;
        
        const maxCon = typeof emp.maxConsecutiveShifts === 'number' && !isNaN(emp.maxConsecutiveShifts) 
            ? emp.maxConsecutiveShifts 
            : globalMaxConsecutiveShifts;
            
        if (consecutive[emp.id] >= maxCon) {
          // Exceeded consecutive shifts, must rest
        } else {
          availableEmployees.push(emp);
        }
      }
    }

    // Shuffle availables for randomness to prevent tie-breaker bias
    for (let i = availableEmployees.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableEmployees[i], availableEmployees[j]] = [availableEmployees[j], availableEmployees[i]];
    }

    // Group available by Project
    const availByProj: Record<string, Employee[]> = {};
    for (const emp of availableEmployees) {
      if (!availByProj[emp.projectId]) availByProj[emp.projectId] = [];
      availByProj[emp.projectId].push(emp);
    }

    // Second pass: satisfy requirements for each project
    for (const [projId, projAvail] of Object.entries(availByProj)) {
      let reqs: DayRequirements = { D: 0, N: 0 };
      if (requirements[monthKey] && requirements[monthKey][projId] && requirements[monthKey][projId][day]) {
        reqs = requirements[monthKey][projId][day];
      } else if (requirements[projId] && requirements[projId][day]) {
         // Fallback for old format if somehow passed
         reqs = requirements[projId][day];
      }
      const assigned = assignedByProj[projId] || { D: 0, N: 0 };
      
      let neededD = Math.max(0, reqs.D - assigned.D);
      let neededN = Math.max(0, reqs.N - assigned.N);

      // Sort Day shifts
      projAvail.sort((a, b) => {
        let wA = shiftCount[a.id];
        let wB = shiftCount[b.id];
        if (a.shiftPreference === 'prefer_day') wA -= 100;
        if (b.shiftPreference === 'prefer_day') wB -= 100;
        if (a.shiftPreference === 'prefer_night') wA += 100;
        if (b.shiftPreference === 'prefer_night') wB += 100;
        return wA - wB;
      });

      // Assign Day shifts
      for (let i = 0; i < projAvail.length && neededD > 0; i++) {
        const emp = projAvail[i];
        const pref = emp.shiftPreference || 'standard';
        
        if (pref === 'only_night') continue;
        if (pref === 'day_weekends_only' && !isWeekend) continue;

        const key = `${emp.id}-${monthKey}-${day}`;
        const locUsage = getUsage(emp.locationId);
        const limit = getLimit(emp.locationId, isWeekend);

        // Cannot work 12д if previous shift was 12н
        if (!newSchedule[key] && locUsage.D < limit && prevShift[emp.id] !== '12н') {
          newSchedule[key] = '12д';
          shiftCount[emp.id]++;
          locUsage.D++;
          neededD--;
        }
      }

      // Re-sort Night shifts
      projAvail.sort((a, b) => {
        let wA = shiftCount[a.id];
        let wB = shiftCount[b.id];
        if (a.shiftPreference === 'prefer_night') wA -= 100;
        if (b.shiftPreference === 'prefer_night') wB -= 100;
        if (a.shiftPreference === 'prefer_day') wA += 100;
        if (b.shiftPreference === 'prefer_day') wB += 100;
        return wA - wB;
      });
      
      // Assign Night shifts
      for (let i = 0; i < projAvail.length && neededN > 0; i++) {
        const emp = projAvail[i];
        const pref = emp.shiftPreference || 'standard';

        if (pref === 'only_day') continue;

        const key = `${emp.id}-${monthKey}-${day}`;
        const locUsage = getUsage(emp.locationId);
        const limit = getLimit(emp.locationId, isWeekend);

        if (!newSchedule[key] && locUsage.N < limit) {
          newSchedule[key] = '12н';
          shiftCount[emp.id]++;
          locUsage.N++;
          neededN--;
        }
      }
    }

    // End of day: update consecutive and prevShift states
    for (const emp of employees) {
      const shift = newSchedule[`${emp.id}-${monthKey}-${day}`];
      if (shift) {
        consecutive[emp.id]++;
        prevShift[emp.id] = shift;
      } else {
        consecutive[emp.id] = 0;
        prevShift[emp.id] = null;
      }
    }
  }

  return newSchedule;
}
