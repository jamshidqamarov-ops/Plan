import React, { useState, useEffect } from 'react';
import { 
  CalendarDays, 
  Settings2,
  Plus, 
  Trash2, 
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Wand2,
  MapPin,
  Briefcase,
  FileUp,
  X,
  Download,
  Repeat
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  getDaysInMonth, 
  startOfMonth,
  getDay
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from './lib/utils';
import { 
  Employee, 
  ConstraintType, 
  generateSchedule, 
  DayRequirements, 
  ShiftType,
  Location,
  Project
} from './lib/autoSchedule';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

const DEFAULT_PROJECTS: Project[] = [
  { id: 'p1', name: 'Поддержка B2B' },
  { id: 'p2', name: 'Call-центр B2C' },
];

const DEFAULT_LOCATIONS: Location[] = [
  { id: 'l1', name: 'Офис Москва', maxDesks: 3 },
  { id: 'l2', name: 'Офис СПБ', maxDesks: 2 },
  { id: 'l3', name: 'Удаленка', maxDesks: 999 },
];

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: '1', name: 'Иванов А.', projectId: 'p1', locationId: 'l1' },
  { id: '2', name: 'Петрова В.', projectId: 'p1', locationId: 'l1' },
  { id: '3', name: 'Сидоров М.', projectId: 'p2', locationId: 'l2' },
  { id: '4', name: 'Смирнова О.', projectId: 'p2', locationId: 'l3' },
  { id: '5', name: 'Кузнецов Д.', projectId: 'p1', locationId: 'l3' },
];

export default function App() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Data State
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('planimum_projects');
    return saved ? JSON.parse(saved) : DEFAULT_PROJECTS;
  });
  const [locations, setLocations] = useState<Location[]>(() => {
    const saved = localStorage.getItem('planimum_locations');
    return saved ? JSON.parse(saved) : DEFAULT_LOCATIONS;
  });
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('planimum_employees');
    return saved ? JSON.parse(saved) : DEFAULT_EMPLOYEES;
  });

  const [activeModal, setActiveModal] = useState<'projects' | 'locations' | 'import' | null>(null);
  
  // monthKey -> projectId -> day -> DayRequirements
  const [requirements, setRequirements] = useState<Record<string, Record<string, Record<number, DayRequirements>>>>(() => {
    const saved = localStorage.getItem('planimum_requirements');
    return saved ? JSON.parse(saved) : {};
  }); 
  
  // `${empId}-${monthKey}-${day}` -> ConstraintType
  const [constraints, setConstraints] = useState<Record<string, ConstraintType>>(() => {
    const saved = localStorage.getItem('planimum_constraints');
    return saved ? JSON.parse(saved) : {};
  });
  
  // `${empId}-${monthKey}-${day}` -> ShiftType | null
  const [schedule, setSchedule] = useState<Record<string, ShiftType | null>>(() => {
    const saved = localStorage.getItem('planimum_schedule');
    return saved ? JSON.parse(saved) : {};
  });

  const [isConstraintMode, setIsConstraintMode] = useState(false);
  const [globalMaxConsecutiveShifts, setGlobalMaxConsecutiveShifts] = useState(3);

  const daysInMonth = getDaysInMonth(currentMonth);
  const monthKey = format(currentMonth, 'yyyy-MM');

  useEffect(() => { localStorage.setItem('planimum_projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem('planimum_locations', JSON.stringify(locations)); }, [locations]);
  useEffect(() => { localStorage.setItem('planimum_employees', JSON.stringify(employees)); }, [employees]);
  useEffect(() => { localStorage.setItem('planimum_requirements', JSON.stringify(requirements)); }, [requirements]);
  useEffect(() => { localStorage.setItem('planimum_constraints', JSON.stringify(constraints)); }, [constraints]);
  useEffect(() => { localStorage.setItem('planimum_schedule', JSON.stringify(schedule)); }, [schedule]);

  // Initialize monthly requirements
  useEffect(() => {
    setRequirements(prev => {
      const next = { ...prev };
      if (!next[monthKey]) next[monthKey] = {};
      
      for (const proj of projects) {
        if (!next[monthKey][proj.id]) {
          next[monthKey][proj.id] = {};
        }
        for (let i = 1; i <= daysInMonth; i++) {
          if (next[monthKey][proj.id][i] === undefined) {
            next[monthKey][proj.id][i] = { D: 1, N: 1 }; // default 1 day, 1 night required
          }
        }
      }
      return next;
    });
  }, [monthKey, daysInMonth, projects]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const addEmployee = () => {
    setEmployees([...employees, { 
      id: generateId(), 
      name: 'Новый сотрудник', 
      projectId: projects[0].id, 
      locationId: locations[0].id 
    }]);
  };

  const removeEmployee = (id: string) => {
    setEmployees(employees.filter(e => e.id !== id));
    setConstraints(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if(k.startsWith(`${id}-`)) delete next[k]; });
      return next;
    });
    setSchedule(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if(k.startsWith(`${id}-`)) delete next[k]; });
      return next;
    });
  };

  const updateEmployee = (id: string, field: keyof Omit<Employee, 'id'>, value: any) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const runAutoSchedule = () => {
    const reqsForMonth = requirements[monthKey] || {};
    const newSchedule = generateSchedule(employees, locations, monthKey, daysInMonth, reqsForMonth, constraints, schedule, globalMaxConsecutiveShifts);
    setSchedule(newSchedule);
  };

  const toggleCell = (empId: string, day: number) => {
    const key = `${empId}-${monthKey}-${day}`;
    if (isConstraintMode) {
      setConstraints(prev => {
        const current = prev[key];
        let nextV: ConstraintType = 'must_work_12д';
        if (current === 'must_work_12д') nextV = 'must_work_12н';
        else if (current === 'must_work_12н') nextV = 'must_off';
        else if (current === 'must_off') nextV = 'vacation';
        else if (current === 'vacation') nextV = 'sick';
        else if (current === 'sick') nextV = null;
        
        return { ...prev, [key]: nextV };
      });
      
      setSchedule(prev => {
        const currentCon = constraints[key];
        const next = { ...prev };
        if (currentCon === null) next[key] = '12д';
        else if (currentCon === 'must_work_12д') next[key] = '12н';
        else next[key] = null;
        return next;
      });
    } else {
      setSchedule(prev => {
        const current = prev[key];
        let nextV: ShiftType | null = '12д';
        if (current === '12д') nextV = '12н';
        else if (current === '12н') nextV = null;
        return { ...prev, [key]: nextV };
      });
    }
  };

  const handleExportCSV = () => {
    const BOM = '\uFEFF';
    let csv = 'Сотрудник;Проект;Локация;Всего смен;';
    const headerRow = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    headerRow.forEach(d => { csv += `${d};`; });
    csv += '\n';

    employees.forEach(emp => {
      const projName = projects.find(p => p.id === emp.projectId)?.name || '';
      const locName = locations.find(l => l.id === emp.locationId)?.name || '';
      const shiftCount = headerRow.reduce((sum, d) => sum + (schedule[`${emp.id}-${monthKey}-${d}`] ? 1 : 0), 0);

      csv += `"${emp.name}";"${projName}";"${locName}";${shiftCount};`;
      headerRow.forEach(d => {
        const key = `${emp.id}-${monthKey}-${d}`;
        const shift = schedule[key];
        const constraint = constraints[key];
        let val = '';
        if (shift) val = shift;
        else if (constraint === 'vacation') val = 'О';
        else if (constraint === 'sick') val = 'Б';
        else if (constraint === 'must_off') val = 'В';
        csv += `"${val}";`;
      });
      csv += '\n';
    });

    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Расписание_${monthKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateRequirement = (projId: string, day: number, shift: 'D' | 'N', valueStr: string) => {
    const num = parseInt(valueStr, 10);
    if (!isNaN(num) && num >= 0) {
      setRequirements(prev => {
        const next = { ...prev };
        if (!next[monthKey]) next[monthKey] = {};
        if (!next[monthKey][projId]) next[monthKey][projId] = {};
        
        const currentDayReq = next[monthKey][projId][day] || { D: 0, N: 0 };
        next[monthKey][projId][day] = { ...currentDayReq, [shift]: num };
        
        return next;
      });
    }
  };

  const [applyAllModal, setApplyAllModal] = useState<string | null>(null);
  const [applyAllValD, setApplyAllValD] = useState(1);
  const [applyAllValN, setApplyAllValN] = useState(1);

  const applyToAllDays = (projId: string) => {
    const defaultD = requirements[monthKey]?.[projId]?.[1]?.D ?? 1;
    const defaultN = requirements[monthKey]?.[projId]?.[1]?.N ?? 1;
    setApplyAllValD(defaultD);
    setApplyAllValN(defaultN);
    setApplyAllModal(projId);
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const clearSchedule = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setSchedule(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.includes(`-${monthKey}-`)) {
          delete next[k];
        }
      }
      return next;
    });
    setConfirmClear(false);
  }

  // --- Modals Logic ---
  const addProject = () => {
    setProjects([...projects, { id: generateId(), name: 'Новый проект' }]);
  };
  const updateProject = (id: string, name: string) => {
    setProjects(projects.map(p => p.id === id ? { ...p, name } : p));
  };
  const deleteProject = (id: string) => {
    if (employees.some(e => e.projectId === id)) return;
    if (projects.length <= 1) return;
    setProjects(projects.filter(p => p.id !== id));
  };

  const addLocation = () => {
    setLocations([...locations, { id: generateId(), name: 'Новая локация', maxDesks: 10 }]);
  };
  const updateLocation = (id: string, name: string, maxDesks: number, maxDesksWeekend?: number) => {
    setLocations(locations.map(l => l.id === id ? { ...l, name, maxDesks, maxDesksWeekend } : l));
  };
  const deleteLocation = (id: string) => {
    if (employees.some(e => e.locationId === id)) return;
    if (locations.length <= 1) return;
    setLocations(locations.filter(l => l.id !== id));
  };

  const [importText, setImportText] = useState('');
  const handleImport = () => {
    if (!importText.trim()) return;
    const lines = importText.trim().split('\n');
    const newEmployees: Employee[] = [];
    
    let currProjects = [...projects];
    let currLocations = [...locations];

    for (const line of lines) {
      const parts = line.split('\t').map(s => s.trim());
      if (parts.length >= 1 && parts[0]) {
        const name = parts[0];
        const projName = parts[1] || currProjects[0].name;
        const locName = parts[2] || currLocations[0].name;

        let proj = currProjects.find(p => p.name.toLowerCase() === projName.toLowerCase());
        if (!proj) {
          proj = { id: generateId(), name: projName };
          currProjects.push(proj);
        }

        let loc = currLocations.find(l => l.name.toLowerCase() === locName.toLowerCase());
        if (!loc) {
          loc = { id: generateId(), name: locName, maxDesks: 10 };
          currLocations.push(loc);
        }

        newEmployees.push({
          id: generateId(),
          name,
          projectId: proj.id,
          locationId: loc.id
        });
      }
    }

    setProjects(currProjects);
    setLocations(currLocations);
    setEmployees([...employees, ...newEmployees]);
    setImportText('');
    setActiveModal(null);
  };

  const headerDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 pb-20">
      {/* --- MODALS --- */}
      {activeModal === 'projects' && (
        <div className="fixed inset-0 z-[100] bg-stone-900/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-stone-200">
              <h2 className="text-lg font-bold flex items-center gap-2"><Briefcase size={20} className="text-blue-600"/> Проекты</h2>
              <button onClick={() => setActiveModal(null)} className="p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 rounded-lg transition"><X size={20}/></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
              {projects.map(p => {
                const isUsed = employees.some(e => e.projectId === p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2 bg-stone-50 p-2 rounded border border-stone-200">
                    <input 
                      value={p.name} 
                      onChange={e => updateProject(p.id, e.target.value)}
                      className="flex-1 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-sm outline-none"
                    />
                    <button 
                      onClick={() => deleteProject(p.id)} 
                      disabled={isUsed || projects.length <= 1}
                      className="text-stone-400 hover:text-red-500 p-1 disabled:opacity-30 disabled:hover:text-stone-400"
                      title={isUsed ? "Проект используется" : "Удалить"}
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                );
              })}
              <button onClick={addProject} className="flex items-center justify-center gap-2 mt-2 w-full py-2 border-2 border-dashed border-stone-300 rounded-lg text-sm font-semibold text-stone-500 hover:bg-stone-50 hover:text-stone-700 hover:border-stone-400 transition">
                <Plus size={16} /> Добавить проект
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'locations' && (
        <div className="fixed inset-0 z-[100] bg-stone-900/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-stone-200">
              <h2 className="text-lg font-bold flex items-center gap-2"><MapPin size={20} className="text-amber-600"/> Локации</h2>
              <button onClick={() => setActiveModal(null)} className="p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 rounded-lg transition"><X size={20}/></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1 text-xs font-semibold text-stone-500 uppercase tracking-wider mb-[-4px]">
                <div className="flex-1">Название</div>
                <div className="w-16 text-center" title="Лимит столов в будние дни">Лимит</div>
                <div className="w-16 text-center" title="Лимит столов в выходные (оставьте пустым чтобы использовать обычный лимит)">Лимит (В)</div>
                <div className="w-8"></div>
              </div>
              {locations.map(l => {
                const isUsed = employees.some(e => e.locationId === l.id);
                return (
                  <div key={l.id} className="flex items-center gap-2 bg-stone-50 p-2 rounded border border-stone-200">
                    <input 
                      value={l.name} 
                      onChange={e => updateLocation(l.id, e.target.value, l.maxDesks, l.maxDesksWeekend)}
                      className="flex-1 min-w-[100px] bg-transparent border-none focus:ring-1 focus:ring-amber-500 rounded px-2 py-1 text-sm outline-none"
                    />
                    <input 
                      type="number"
                      min="1"
                      value={l.maxDesks} 
                      onChange={e => updateLocation(l.id, l.name, parseInt(e.target.value) || 1, l.maxDesksWeekend)}
                      className="w-16 text-center bg-white border border-stone-300 focus:ring-1 focus:ring-amber-500 rounded px-2 py-1 text-sm outline-none font-mono"
                      title="Пустые слоты в будние"
                    />
                    <input 
                      type="number"
                      min="1"
                      value={l.maxDesksWeekend || ''}
                      placeholder="="
                      onChange={e => updateLocation(l.id, l.name, l.maxDesks, e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-16 text-center bg-white border border-stone-300 focus:ring-1 focus:ring-amber-500 rounded px-2 py-1 text-sm outline-none font-mono"
                      title="Пустые слоты в выходные"
                    />
                    <button 
                      onClick={() => deleteLocation(l.id)} 
                      disabled={isUsed || locations.length <= 1}
                      className="text-stone-400 hover:text-red-500 p-1 disabled:opacity-30 disabled:hover:text-stone-400 shrink-0"
                      title={isUsed ? "Локация используется" : "Удалить"}
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                );
              })}
              <button onClick={addLocation} className="flex items-center justify-center gap-2 mt-2 w-full py-2 border-2 border-dashed border-stone-300 rounded-lg text-sm font-semibold text-stone-500 hover:bg-stone-50 hover:text-stone-700 hover:border-stone-400 transition">
                <Plus size={16} /> Добавить локацию
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'import' && (
        <div className="fixed inset-0 z-[100] bg-stone-900/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-stone-200">
              <h2 className="text-lg font-bold flex items-center gap-2"><FileUp size={20} className="text-emerald-600"/> Импорт сотрудников (Excel)</h2>
              <button onClick={() => setActiveModal(null)} className="p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 rounded-lg transition"><X size={20}/></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <p className="text-sm text-stone-600">
                Скопируйте таблицу из Excel и вставьте ниже. Ожидаемый формат: <strong>3 колонки</strong> (имя, проект, локация).<br/>
                Если проект или локация не найдены, они будут созданы автоматически. <br/>
                <em>Примечание: колонки разделяются табуляцией.</em>
              </p>
              
              <div className="bg-stone-100 p-3 rounded-lg border border-stone-200 text-xs font-mono text-stone-500 overflow-x-auto">
                <div className="flex gap-4">
                  <div className="w-32 font-bold">Имя</div>
                  <div className="w-32 font-bold">Название проекта</div>
                  <div className="w-32 font-bold">Локация</div>
                </div>
                <div className="flex gap-4 mt-1 opacity-70">
                  <div className="w-32 truncate border-r border-stone-300 pr-2">Иванов Петр</div>
                  <div className="w-32 truncate border-r border-stone-300 pr-2">Поддержка B2B</div>
                  <div className="w-32 truncate">Офис Москва</div>
                </div>
              </div>

              <textarea 
                className="w-full h-48 border border-stone-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none font-mono"
                placeholder="Вставьте скопированные данные сюда..."
                value={importText}
                onChange={e => setImportText(e.target.value)}
              />
            </div>
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-3">
              <button onClick={() => setActiveModal(null)} className="px-5 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-200 bg-stone-100 rounded-lg transition">Отмена</button>
              <button onClick={handleImport} className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow shadow-emerald-200 rounded-lg transition flex items-center gap-2">
                <Plus size={16} /> Добавить сотрудников
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-stone-200 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
            <CalendarDays size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Planimum Графики</h1>
            <p className="text-xs text-stone-500 font-medium">Умное распределение смен</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-stone-100 p-1.5 rounded-lg border border-stone-200 shrink-0">
          <button onClick={handlePrevMonth} className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-white rounded transition">
            <ChevronLeft size={20} />
          </button>
          <div className="w-40 text-center font-semibold capitalize">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
          </div>
          <button onClick={handleNextMonth} className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-white rounded transition">
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-sm bg-white border border-stone-200 px-3 py-1.5 rounded-lg shadow-sm w-full md:w-auto">
            <span className="font-semibold text-stone-600 truncate">Смен подряд по умолч:</span>
            <input 
              type="number" 
              min="1" 
              max="31"
              className="w-12 text-center border border-stone-300 rounded font-bold bg-stone-50 outline-none focus:ring-1 focus:ring-indigo-500"
              value={globalMaxConsecutiveShifts}
              onChange={e => {
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v > 0) setGlobalMaxConsecutiveShifts(v);
              }}
            />
          </div>

          <button 
            onClick={() => setIsConstraintMode(!isConstraintMode)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm border",
              isConstraintMode 
                ? "bg-amber-100 border-amber-300 text-amber-800" 
                : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
            )}
            title="Зафиксировать выходные и рабочие дни"
          >
            <Settings2 size={16} />
            <span className="hidden sm:inline">{isConstraintMode ? 'Режим: Условия' : 'Режим: Редактор'}</span>
          </button>
          
          <button 
            onClick={runAutoSchedule}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-md shadow-indigo-200 transition-all active:scale-95"
          >
            <Wand2 size={16} />
            <span className="hidden sm:inline">Авто-план</span>
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md shadow-emerald-200 transition-all active:scale-95"
            title="Экспорт в Excel/CSV"
          >
            <Download size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto p-4 md:p-6 lg:p-8">
        {!isConstraintMode && (
          <div className="mb-6 flex justify-between items-center bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl shadow-sm">
            <p className="text-sm">
              <strong>Режим редактора:</strong> Кликайте на ячейки, чтобы назначить сотруднику смену в этот день: <span className="font-bold text-sky-600">12д</span> или <span className="font-bold text-indigo-600">12н</span>. <br/>
              Чтобы задать строгие выходные или рабочие дни, переключитесь в <strong>Режим Условий</strong>.
            </p>
            <button onClick={clearSchedule} className="text-xs font-semibold bg-white px-3 py-1.5 rounded text-blue-700 border border-blue-200 hover:bg-blue-100 transition whitespace-nowrap">
              {confirmClear ? "Вы уверены?" : "Очистить смены"}
            </button>
          </div>
        )}
        {isConstraintMode && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl shadow-sm">
            <p className="text-sm flex-1">
              <strong>Режим условий:</strong> Задайте условия перед авто-планированием. Кликайте для переключения:<br/>
              <span className="font-bold text-sky-700">12д</span> - точно дневная смена, <span className="font-bold text-indigo-700">12н</span> - точно ночная, <XCircle size={14} className="inline text-red-500"/> - точно выходной, <span className="font-bold text-emerald-600 text-[11px]">Отпуск</span> / <span className="font-bold text-rose-600 text-[11px]">Болеет</span> - другие типы.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto nice-scrollbar">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-stone-100 border-b border-r border-stone-200 p-3 text-left w-64 shadow-[2px_0_5px_-3px_rgba(0,0,0,0.1)]">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-stone-700">Сотрудники ({employees.length})</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setActiveModal('projects')} className="text-blue-600 hover:bg-blue-100 bg-blue-50 p-1.5 rounded transition" title="Управление проектами">
                          <Briefcase size={16} />
                        </button>
                        <button onClick={() => setActiveModal('locations')} className="text-amber-600 hover:bg-amber-100 bg-amber-50 p-1.5 rounded transition" title="Управление локациями">
                          <MapPin size={16} />
                        </button>
                        <button onClick={() => setActiveModal('import')} className="text-emerald-600 hover:bg-emerald-100 bg-emerald-50 p-1.5 rounded transition" title="Импорт сотрудников">
                          <FileUp size={16} />
                        </button>
                        <button onClick={addEmployee} className="text-indigo-600 hover:bg-indigo-100 bg-indigo-50 p-1.5 rounded transition ml-1" title="Добавить сотрудника">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </th>
                  {headerDays.map(day => {
                    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    
                    return (
                      <th key={day} className={cn(
                        "p-2 border-b border-r border-stone-200 font-medium text-center min-w-[50px] transition-colors relative select-none",
                        isWeekend ? "bg-red-50/70 text-red-700" : "bg-stone-50 text-stone-600"
                      )}>
                        <div className="text-[10px] uppercase opacity-70 mb-0.5">{format(date, 'eee', { locale: ru })}</div>
                        <div className="text-sm font-bold">{day}</div>
                      </th>
                    );
                  })}
                  <th className="bg-stone-100 border-b border-stone-200 p-3 text-center w-16 font-semibold">
                    Итог
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const shiftCount = headerDays.reduce((sum, d) => sum + (schedule[`${emp.id}-${monthKey}-${d}`] ? 1 : 0), 0);
                  
                  return (
                    <tr key={emp.id} className="group hover:bg-stone-50/50 transition-colors">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-stone-50 border-b border-r border-stone-200 p-2 shadow-[2px_0_5px_-3px_rgba(0,0,0,0.1)]">
                        <div className="flex flex-col gap-1.5 px-1 w-full">
                          <div className="flex items-center justify-between">
                            <input 
                              type="text" 
                              value={emp.name}
                              onChange={(e) => updateEmployee(emp.id, 'name', e.target.value)}
                              className="font-medium text-stone-800 bg-transparent border-none focus:ring-0 p-0 text-sm w-full outline-none leading-tight"
                            />
                            <button onClick={() => removeEmployee(emp.id)} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-600 p-1 rounded transition shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          
                          {/* Assign Project & Location & Preference */}
                          <div className="flex flex-col gap-1 text-[10px]">
                            <select 
                              value={emp.projectId} 
                              onChange={e => updateEmployee(emp.id, 'projectId', e.target.value)}
                              className="bg-blue-50 border border-blue-200 text-blue-800 rounded px-1 py-0.5 min-w-0 outline-none"
                            >
                              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <select 
                              value={emp.locationId} 
                              onChange={e => updateEmployee(emp.id, 'locationId', e.target.value)}
                              className="bg-amber-50 border border-amber-200 text-amber-800 rounded px-1 py-0.5 min-w-0 outline-none"
                            >
                              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <select
                              value={emp.shiftPreference || 'standard'}
                              onChange={e => updateEmployee(emp.id, 'shiftPreference', e.target.value)}
                              className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded px-1 py-0.5 min-w-0 outline-none"
                              title="Индивидуальные предпочтения"
                            >
                              <option value="standard">Стандартно (все)</option>
                              <option value="only_day">Только дневные</option>
                              <option value="only_night">Только ночные</option>
                              <option value="prefer_day">Любит дневные</option>
                              <option value="prefer_night">Любит ночные</option>
                              <option value="day_weekends_only">Дневные только Сб-Вс</option>
                            </select>
                          </div>
                          <div className="flex flex-row items-center justify-between pt-1 mt-0.5 border-t border-stone-100">
                             <span className="text-[9px] text-stone-500 font-medium">Макс. подряд смен</span>
                             <input 
                               type="number" 
                               min="1"
                               className="w-10 text-[10px] px-1 py-0 border border-stone-200 rounded text-center bg-stone-100"
                               placeholder={String(globalMaxConsecutiveShifts)}
                               value={emp.maxConsecutiveShifts ?? ''}
                               onChange={e => {
                                 const val = parseInt(e.target.value);
                                 updateEmployee(emp.id, 'maxConsecutiveShifts', isNaN(val) ? undefined : val);
                               }}
                             />
                          </div>
                        </div>
                      </td>
                      
                      {headerDays.map(day => {
                        const key = `${emp.id}-${monthKey}-${day}`;
                        const shift = schedule[key];
                        const constraint = constraints[key];
                        
                        let cellBg = "hover:bg-stone-50";
                        if (shift) cellBg = shift === '12д' ? "bg-sky-50 hover:bg-sky-100" : "bg-indigo-50 hover:bg-indigo-100";

                        let cellContent = null;
                        if (constraint === 'must_work_12д') {
                          cellContent = <span className="font-bold text-sky-800">12д</span>;
                          cellBg = shift === '12д' ? "bg-sky-200 hover:bg-sky-300 shadow-inner" : "bg-sky-100 border-sky-300 border";
                        } else if (constraint === 'must_work_12н') {
                          cellContent = <span className="font-bold text-indigo-800">12н</span>;
                          cellBg = shift === '12н' ? "bg-indigo-200 hover:bg-indigo-300 shadow-inner" : "bg-indigo-100 border-indigo-300 border";
                        } else if (constraint === 'must_off') {
                          cellContent = <XCircle size={16} className="text-red-500 mx-auto opacity-70" />;
                          cellBg = "bg-stone-100 hover:bg-stone-200";
                        } else if (constraint === 'vacation') {
                          cellContent = <span className="font-bold text-emerald-600 text-[11px]">Отпуск</span>;
                          cellBg = "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 border-dashed border";
                        } else if (constraint === 'sick') {
                          cellContent = <span className="font-bold text-rose-600 text-[11px]">Болеет</span>;
                          cellBg = "bg-rose-50 hover:bg-rose-100 border-rose-200 border-dashed border";
                        } else if (shift) {
                          cellContent = <span className={cn("font-bold", shift === '12д' ? "text-sky-700" : "text-indigo-700")}>{shift}</span>;
                        }

                        return (
                          <td 
                            key={day} 
                            onClick={() => toggleCell(emp.id, day)}
                            className={cn("border-b border-r border-stone-200 p-0 text-center cursor-pointer transition-colors relative", cellBg)}
                          >
                            <div className="w-full h-12 flex items-center justify-center font-medium text-xs">
                              {cellContent}
                              {!cellContent && shift && (
                                <span className={shift === '12д' ? 'text-sky-700 font-semibold' : 'text-indigo-700 font-semibold'}>
                                    {shift}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      
                      <td className="border-b border-stone-200 p-2 text-center bg-stone-50 font-mono font-medium text-stone-700 text-xs">
                        {shiftCount}
                      </td>
                    </tr>
                  );
                })}
                
                {/* ---------------- PROJECT REQUIREMENTS ROW ---------------- */}
                {projects.map(proj => {
                  return (
                    <tr key={`req-${proj.id}`} className="bg-blue-50/30">
                      <td className="sticky left-0 z-10 border-y border-r border-blue-200 bg-blue-50 p-2 shadow-[2px_0_5px_-3px_rgba(0,0,0,0.1)]">
                        <div className="flex flex-col group/proj-title">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Потребность</span>
                            <button 
                              onClick={() => applyToAllDays(proj.id)} 
                              className="text-blue-400 hover:text-blue-700 p-0.5 rounded transition opacity-0 group-hover/proj-title:opacity-100 sm:opacity-100" 
                              title="Заполнить лимит на все дни месяца"
                            >
                              <Repeat size={12} />
                            </button>
                          </div>
                          <span className="text-xs font-semibold text-blue-900 truncate leading-tight mt-0.5">{proj.name}</span>
                        </div>
                      </td>
                      {headerDays.map(day => {
                        const req = requirements[monthKey]?.[proj.id]?.[day] || { D: 0, N: 0 };
                        
                        // calculate assignments
                        let assignedD = 0;
                        let assignedN = 0;
                        for (const emp of employees) {
                          if (emp.projectId === proj.id) {
                            if (schedule[`${emp.id}-${monthKey}-${day}`] === '12д') assignedD++;
                            else if (schedule[`${emp.id}-${monthKey}-${day}`] === '12н') assignedN++;
                          }
                        }

                        const dOk = assignedD >= req.D;
                        const nOk = assignedN >= req.N;

                        return (
                          <td key={day} className="border-y border-r border-blue-100 p-1 text-center align-middle">
                            <div className="flex flex-col gap-1 items-center justify-center">
                              {/* D row */}
                              <div className="flex items-center divide-x divide-sky-200 rounded border border-sky-300 bg-white overflow-hidden shadow-sm">
                                <input 
                                  type="number"
                                  min="0"
                                  value={req.D}
                                  onChange={e => updateRequirement(proj.id, day, 'D', e.target.value)} 
                                  className="text-[10px] w-[22px] text-center bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold leading-relaxed outline-none focus:ring-0 p-0 m-0 no-spinners" 
                                  title="Потребность (Дневная)"
                                />
                                <div className={cn("text-[9px] w-[18px] text-center font-bold leading-relaxed", dOk ? (req.D>0 ? "bg-emerald-100 text-emerald-800" : "bg-stone-50 text-stone-400") : "bg-red-100 text-red-800")} title="Назначено (Дневная)">
                                  {assignedD}
                                </div>
                              </div>
                              {/* N row */}
                              <div className="flex items-center divide-x divide-indigo-200 rounded border border-indigo-300 bg-white overflow-hidden shadow-sm">
                                <input
                                  type="number"
                                  min="0"
                                  value={req.N}
                                  onChange={e => updateRequirement(proj.id, day, 'N', e.target.value)} 
                                  className="text-[10px] w-[22px] text-center bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold leading-relaxed outline-none focus:ring-0 p-0 m-0 no-spinners" 
                                  title="Потребность (Ночная)"
                                />
                                <div className={cn("text-[9px] w-[18px] text-center font-bold leading-relaxed", nOk ? (req.N>0 ? "bg-emerald-100 text-emerald-800" : "bg-stone-50 text-stone-400") : "bg-red-100 text-red-800")} title="Назначено (Ночная)">
                                  {assignedN}
                                </div>
                              </div>
                            </div>
                          </td>
                        )
                      })}
                      <td className="border-y border-blue-200 bg-blue-50"></td>
                    </tr>
                  )
                })}

                {/* ---------------- LOCATION UTILS ROW ---------------- */}
                {locations.map((loc, idx) => {
                  const isLast = idx === locations.length - 1;
                  return (
                    <tr key={`loc-${loc.id}`} className="bg-amber-50/40">
                      <td className="sticky left-0 z-10 border-t border-r border-amber-200 bg-amber-50 p-2 shadow-[2px_0_5px_-3px_rgba(0,0,0,0.1)]">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Лимиты локации</span>
                          <span className="text-xs font-semibold text-amber-900 truncate leading-tight mt-0.5">{loc.name}</span>
                          <span className="text-[10px] text-amber-700 mt-0.5 font-medium">Свободно: (Д/Н)</span>
                        </div>
                      </td>
                      {headerDays.map(day => {
                        let usedD = 0;
                        let usedN = 0;
                        for (const emp of employees) {
                          if (emp.locationId === loc.id) {
                            if (schedule[`${emp.id}-${day}`] === '12д') usedD++;
                            else if (schedule[`${emp.id}-${day}`] === '12н') usedN++;
                          }
                        }

                        const allowD = loc.maxDesks - usedD;
                        const allowN = loc.maxDesks - usedN;

                        return (
                          <td key={day} className={cn("border-t border-r border-amber-100 p-1 align-middle text-center", isLast ? "border-b border-amber-200" : "")}>
                            <div className="flex flex-col gap-1 items-center justify-center">
                              <span className={cn("text-[9px] font-bold px-1 rounded-sm w-[36px] text-center", allowD < 0 ? "bg-red-500 text-white" : allowD === 0 ? "bg-amber-200 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
                                {allowD < 0 ? 'ПЕРЕБОР' : `${allowD} д.`}
                              </span>
                              <span className={cn("text-[9px] font-bold px-1 rounded-sm w-[36px] text-center", allowN < 0 ? "bg-red-500 text-white" : allowN === 0 ? "bg-amber-200 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
                                {allowN < 0 ? 'ПЕРЕБОР' : `${allowN} н.`}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                      <td className={cn("border-t border-amber-200 bg-amber-50", isLast ? "border-b border-amber-200" : "")}></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {applyAllModal && (
          <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                <h2 className="font-bold text-stone-700">Потребность на месяц</h2>
                <button onClick={() => setApplyAllModal(null)} className="p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 rounded-lg transition"><X size={20}/></button>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <p className="text-sm text-stone-600">Задать количество смен на каждый день этого месяца <span className="font-semibold text-stone-900">({projects.find(p => p.id === applyAllModal)?.name})</span>:</p>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-stone-500 mb-1">Дневных (12д)</label>
                    <input type="number" min="0" value={applyAllValD} onChange={e => setApplyAllValD(parseInt(e.target.value)||0)} className="w-full bg-stone-50 border border-stone-200 focus:ring-1 focus:ring-sky-500 rounded px-3 py-2 outline-none text-sky-800 font-bold"/>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-stone-500 mb-1">Ночных (12н)</label>
                    <input type="number" min="0" value={applyAllValN} onChange={e => setApplyAllValN(parseInt(e.target.value)||0)} className="w-full bg-stone-50 border border-stone-200 focus:ring-1 focus:ring-indigo-500 rounded px-3 py-2 outline-none text-indigo-800 font-bold"/>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setRequirements(prev => {
                      const next = { ...prev };
                      if (!next[monthKey]) next[monthKey] = {};
                      if (!next[monthKey][applyAllModal]) next[monthKey][applyAllModal] = {};
                      for (let i = 1; i <= daysInMonth; i++) {
                        next[monthKey][applyAllModal][i] = { D: applyAllValD, N: applyAllValN };
                      }
                      return next;
                    });
                    setApplyAllModal(null);
                  }}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition mt-2"
                >
                  Применить ко всем дням
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .nice-scrollbar::-webkit-scrollbar {
          height: 14px;
          width: 14px;
        }
        .nice-scrollbar::-webkit-scrollbar-track {
          background: #f5f5f4;
          border-radius: 0 0 16px 16px;
        }
        .nice-scrollbar::-webkit-scrollbar-thumb {
          background-color: #d6d3d1;
          border-radius: 8px;
          border: 3px solid #f5f5f4;
        }
        .no-spinners::-webkit-inner-spin-button,
        .no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
