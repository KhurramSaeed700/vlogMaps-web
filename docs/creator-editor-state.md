# Editor state

The editor uses React state rather than a global store.

`useCreatorEditorDocument` owns the persisted document (points, trip route, route shapes and saved places). Its reducer supports functional field updates, atomic document replacement during loading, and map-only restoration during undo/redo. Map restoration deliberately leaves saved places alone.

`useCreatorEditorHistory` owns undo and redo together. Recording an edit clears redo, history retains 50 snapshots, and switching videos clears both stacks. The editor still constructs deep-cloned snapshots and restores transient placement state alongside map data.

Reducers are pure: they do not save, fetch, synchronize metadata or animate. Existing autosave revisions, local backups, retry handling and cloud loading guards remain in the editor's persistence flow. Playback and map animation retain their existing refs and animation loops.

Run `node scripts/test-creator-editor-state.cjs` to check document transitions and history invariants. This is a focused extraction, not a migration of all editor UI state or an introduction of Redux/Zustand.
