import { priorityMeta, statusMeta, type PriorityMeta, type StatusMeta } from '../../shared/constants.ts';
import { estimateMinutes, formatMinutes, formatSeconds, isOverdue, realSeconds } from '../../shared/rules.ts';
import type { TaskDTO, TimerDTO, UserDTO } from '../../shared/types.ts';
import { formatShortDate, weekNumber } from '../../shared/weeks.ts';

export interface TaskView {
  task: TaskDTO;
  name: string;
  done: boolean;
  st: StatusMeta;
  pr: PriorityMeta;
  est: string;
  real: string;
  over: boolean;
  barPct: number;
  barColor: string;
  progColor: string;
  dueLabel: string;
  dueColor: string;
  overdue: boolean;
  carriedLabel: string | null;
  movedLabel: string | null;
  people: Array<Pick<UserDTO, 'initials' | 'color' | 'name' | 'firstName'>>;
  timerOn: boolean;
  typeLabel: string;
  typeColor: string;
  typeSoft: string;
}

/** Datos de presentación de una tarea (equivalente a row() del prototipo). */
export function taskView(t: TaskDTO, opts: { filter: string | null; today: string; timer: TimerDTO | null; team: readonly UserDTO[] }): TaskView {
  const est = estimateMinutes(t, opts.filter);
  const real = realSeconds(t, opts.filter);
  const done = t.status === 'done';
  const overdue = isOverdue(t, opts.today);
  const over = real / 60 > est && est > 0;
  const plan = t.type === 'plan';
  return {
    task: t,
    name: t.name || 'Sin título',
    done,
    st: statusMeta(t.status),
    pr: priorityMeta(t.priority),
    est: formatMinutes(est),
    real: formatSeconds(real),
    over,
    barPct: est ? Math.min(real / 60 / est, 1) * 100 : 0,
    barColor: over ? '#E6195F' : done ? '#7DBA1F' : '#5E1A8C',
    progColor: t.progress === 100 ? '#47740A' : '#5E1A8C',
    dueLabel: formatShortDate(t.dueDate) + (overdue ? ' · vencida' : ''),
    dueColor: overdue ? '#C2134F' : '#4A4752',
    overdue,
    carriedLabel: t.carriedFromWeek ? `Viene de S${weekNumber(t.carriedFromWeek)}` : null,
    movedLabel: t.movedToWeek ? `Pasó a S${weekNumber(t.movedToWeek)}` : null,
    people: t.assignees.map((a) => personFor(a.userId, opts.team)),
    timerOn: !!opts.timer && opts.timer.taskId === t.id,
    typeLabel: plan ? 'Planeada' : 'Adicional',
    typeColor: plan ? '#5E1A8C' : '#C2134F',
    typeSoft: plan ? '#F1E9F7' : '#FDE4ED',
  };
}

/** Persona desconocida (p. ej. inactiva) para mostrar en avatares. */
export function personFor(userId: string, team: readonly UserDTO[], all: readonly UserDTO[] = []): Pick<UserDTO, 'initials' | 'color' | 'name' | 'firstName'> {
  return team.find((u) => u.id === userId) ?? all.find((u) => u.id === userId) ?? { initials: '?', color: '#8A8A8F', name: 'Persona inactiva', firstName: 'Inactiva' };
}
