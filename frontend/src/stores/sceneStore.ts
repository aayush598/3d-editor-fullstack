import { create, StateCreator } from 'zustand'
import { nanoid } from 'nanoid'

type PrimitiveType = 'cube' | 'sphere' | 'plane'

export interface SceneObject {
  id: string
  type: PrimitiveType
  position: [number, number, number]
  parentId?: string | null
}

interface SceneState {
  objects: SceneObject[]
  selectedId: string | null
  addObject: (type: PrimitiveType, parentId?: string | null) => void
  selectObject: (id: string | null) => void
  updateObjectPosition: (id: string, position: [number, number, number]) => void
  setParent: (id: string, parentId: string | null) => void
  undo: () => void
  redo: () => void
}

type HistoryState = {
  past: SceneObject[][]
  present: SceneObject[]
  future: SceneObject[][]
}

export const useSceneStore = create<SceneState>((set, get) => ({
  // initial history state
  objects: [],
  selectedId: null,

  addObject: (type, parentId = null) => {
    const newObj: SceneObject = {
      id: nanoid(),
      type,
      position: [Math.random() * 2 - 1, 1, Math.random() * 2 - 1],
      parentId,
    }
    const newObjects = [...get().objects, newObj]
    pushHistory(newObjects, set, get)
  },

  selectObject: (id) => set({ selectedId: id }),

  updateObjectPosition: (id, position) => {
    const newObjects = get().objects.map((o) =>
      o.id === id ? { ...o, position } : o
    )
    pushHistory(newObjects, set, get)
  },

  setParent: (id, parentId) => {
    const newObjects = get().objects.map((o) =>
      o.id === id ? { ...o, parentId } : o
    )
    pushHistory(newObjects, set, get)
  },

  undo: () => {
    const history = historyStore
    if (history.past.length > 0) {
      const previous = history.past[history.past.length - 1]
      history.future.unshift(history.present)
      history.present = previous
      history.past.pop()
      set({ objects: previous })
    }
  },

  redo: () => {
    const history = historyStore
    if (history.future.length > 0) {
      const next = history.future[0]
      history.past.push(history.present)
      history.present = next
      history.future.shift()
      set({ objects: next })
    }
  },
}))

// simple in-module history object
const historyStore: HistoryState = {
  past: [],
  present: [],
  future: [],
}

// Define the type for the pushHistory function's arguments
type SetState<T> = Parameters<StateCreator<T>>[0]
type GetState<T> = Parameters<StateCreator<T>>[1]

function pushHistory(
    newObjects: SceneObject[], 
    set: SetState<SceneState>, 
    get: SetState<SceneState>
) {
  // push current present to past
  historyStore.past.push(historyStore.present)
  // set new present
  historyStore.present = newObjects
  // clear future
  historyStore.future = []
  set({ objects: newObjects })
}
