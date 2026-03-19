'use client'

import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from './useAuthStore'

export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  logs: string[] // fechas completadas en formato YYYY-MM-DD
  createdAt: string
}

interface HabitState {
  habits: Habit[]
  loading: boolean

  fetchHabits: () => Promise<void>
  addHabit: (habit: Omit<Habit, 'id' | 'createdAt' | 'logs'>) => Promise<void>
  deleteHabit: (id: string) => Promise<void>
  toggleLog: (habitId: string, dateKey: string) => Promise<void>
}

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  loading: false,

  fetchHabits: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ loading: true })
    const supabase = createClient()

    // Cargar hábitos del usuario
    const { data: habitsData, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error || !habitsData) {
      set({ loading: false })
      return
    }

    // Cargar todos los logs agrupados por habit_id
    const habitIds = habitsData.map((h) => h.id)
    let logsData: Array<{ habit_id: string; date: string }> = []

    if (habitIds.length > 0) {
      const { data } = await supabase
        .from('habit_logs')
        .select('habit_id, date')
        .eq('user_id', user.id)
        .in('habit_id', habitIds)
      logsData = data ?? []
    }

    // Agrupar logs por hábito
    const logsByHabit: Record<string, string[]> = {}
    for (const log of logsData) {
      if (!logsByHabit[log.habit_id]) logsByHabit[log.habit_id] = []
      logsByHabit[log.habit_id].push(log.date)
    }

    const habits: Habit[] = habitsData.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      logs: logsByHabit[h.id] ?? [],
      createdAt: h.created_at,
    }))

    set({ habits, loading: false })
  },

  addHabit: async (habitData) => {
    const user = useAuthStore.getState().user
    if (!user) return
    const supabase = createClient()

    const { data, error } = await supabase
      .from('habits')
      .insert({
        user_id: user.id,
        name: habitData.name,
        icon: habitData.icon,
        color: habitData.color,
      })
      .select()
      .single()

    if (!error && data) {
      const newHabit: Habit = {
        id: data.id,
        name: data.name,
        icon: data.icon,
        color: data.color,
        logs: [],
        createdAt: data.created_at,
      }
      set((s) => ({ habits: [...s.habits, newHabit] }))
    }
  },

  deleteHabit: async (id) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const prev = get().habits
    // Optimista
    set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))

    const supabase = createClient()
    const { error } = await supabase.from('habits').delete().eq('id', id).eq('user_id', user.id)
    if (error) {
      set({ habits: prev })
    }
  },

  toggleLog: async (habitId, dateKey) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const habit = get().habits.find((h) => h.id === habitId)
    if (!habit) return

    const isChecked = habit.logs.includes(dateKey)

    // Optimista
    set((s) => ({
      habits: s.habits.map((h) => {
        if (h.id !== habitId) return h
        const newLogs = isChecked
          ? h.logs.filter((d) => d !== dateKey)
          : [...h.logs, dateKey]
        return { ...h, logs: newLogs }
      }),
    }))

    const supabase = createClient()

    if (isChecked) {
      await supabase
        .from('habit_logs')
        .delete()
        .eq('habit_id', habitId)
        .eq('user_id', user.id)
        .eq('date', dateKey)
    } else {
      const { error } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, user_id: user.id, date: dateKey })

      if (error) {
        // Revertir si falla la inserción
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === habitId ? { ...h, logs: h.logs.filter((d) => d !== dateKey) } : h
          ),
        }))
      }
    }
  },
}))
