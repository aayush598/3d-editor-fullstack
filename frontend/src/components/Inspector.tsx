'use client'

import { useSceneStore } from '@/stores/sceneStore'
import { ReactNode } from 'react'
import { SceneObject } from '@/stores/sceneStore'

interface TreeItemProps {
  obj: SceneObject
  depth: number
  onSelect: (id: string) => void
  selectedId: string | null
  children?: ReactNode
}

function TreeItem({
  obj,
  depth,
  onSelect,
  selectedId,
  children,
}: TreeItemProps) {
  return (
    <div style={{ paddingLeft: depth * 12 }} className={`cursor-pointer ${obj.id === selectedId ? 'bg-yellow-200' : ''}`}>
      <div onClick={() => onSelect(obj.id)}>
        {obj.type} ({obj.id.slice(0, 4)})
      </div>
      {children}
    </div>
  )
}

export default function Inspector() {
  const objects = useSceneStore((s) => s.objects)
  const selectedId = useSceneStore((s) => s.selectedId)
  const selectObject = useSceneStore((s) => s.selectObject)
  const setParent = useSceneStore((s) => s.setParent)
  
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)

  const selected = objects.find((o) => o.id === selectedId)

  // Build tree recursively
  const renderTree = (parentId: string | null, depth = 0) => {
    return objects
      .filter((o) => (o.parentId ?? null) === parentId)
      .map((o) => (
        <TreeItem
          key={o.id}
          obj={o}
          depth={depth}
          onSelect={selectObject}
          selectedId={selectedId}
        >
          {renderTree(o.id, depth + 1)}
        </TreeItem>
      ))
  }

  return (
    <div className="p-2 text-sm overflow-auto">
      <h2 className="font-bold mb-2">Scene Graph</h2>
      {renderTree(null)}

      <div className="flex gap-2 my-2">
        <button onClick={undo} className="bg-gray-700 p-1 rounded">Undo</button>
        <button onClick={redo} className="bg-gray-700 p-1 rounded">Redo</button>
      </div>

      {selected && (
        <div className="mt-4">
          <h3 className="font-bold">Selected:</h3>
          <div>ID: {selected.id}</div>
          <div>Type: {selected.type}</div>
          <div>
            Position: {selected.position.map((n) => n.toFixed(2)).join(', ')}
          </div>

          {/* Simple parenting: pick a parent from dropdown */}
          <div className="mt-2">
            <label className="block mb-1">Parent:</label>
            <select
              className="w-full text-black"
              value={selected.parentId ?? ''}
              onChange={(e) =>
                setParent(selected.id, e.target.value || null)
              }
            >
              <option value="">(no parent)</option>
              {objects
                .filter((o) => o.id !== selected.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.type} ({o.id.slice(0, 4)})
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
