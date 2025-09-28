'use client'

import EditorCanvas from "./../../components/EditorCanvas"
import Inspector from './../../components/Inspector'
import { useSceneStore } from '@/stores/sceneStore'

export default function EditorPage() {
  const addObject = useSceneStore((s) => s.addObject)

  return (
    <main className="w-screen h-screen flex">
      <div className="w-64 bg-gray-800 border-r p-2 text-white">
        <h1 className="font-bold mb-2">Add Primitive</h1>
        <div className="flex flex-col gap-1 mb-4">
          <button onClick={() => addObject('cube')} className="bg-gray-700 p-1 rounded">Add Cube</button>
          <button onClick={() => addObject('sphere')} className="bg-gray-700 p-1 rounded">Add Sphere</button>
          <button onClick={() => addObject('plane')} className="bg-gray-700 p-1 rounded">Add Plane</button>
        </div>
        <div className="text-xs mb-2">
          Shortcuts: <strong>T</strong>=Move, <strong>R</strong>=Rotate, <strong>S</strong>=Scale
        </div>
        <Inspector />
      </div>
      <div className="flex-1">
        <EditorCanvas />
      </div>
    </main>
  )
}
