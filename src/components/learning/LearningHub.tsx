import React, { useState } from 'react';
import { GraduationCap, BookOpen, FileText } from 'lucide-react';
import type { Course, Note, ReadingItem } from '../../types';
import AcademicTracker from '../academic/AcademicTracker';
import { ClassNotes } from '../academic/ClassNotes';
import { ReadingPipeline } from '../reading/ReadingPipeline';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  courses: Course[];
  setCourses: (v: Course[] | ((p: Course[]) => Course[])) => void;
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  readingItems: ReadingItem[];
  setReadingItems: (v: ReadingItem[] | ((p: ReadingItem[]) => ReadingItem[])) => void;
}

type TabId = 'academic' | 'class-notes' | 'reading';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'academic',    label: 'Courses',     icon: <GraduationCap size={14} /> },
  { id: 'class-notes', label: 'Class Notes', icon: <FileText size={14} /> },
  { id: 'reading',     label: 'Reading',     icon: <BookOpen size={14} /> },
];

export function LearningHub({ courses, setCourses, notes, setNotes, readingItems, setReadingItems }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('academic');

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex-1 justify-center"
            style={{
              backgroundColor: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'academic' && (
        <AcademicTracker
          courses={courses}
          setCourses={setCourses}
          onNavigateToClassNotes={() => setActiveTab('class-notes')}
        />
      )}
      {activeTab === 'class-notes' && (
        <ClassNotes
          notes={notes}
          setNotes={setNotes}
          courses={courses}
          onBack={() => setActiveTab('academic')}
        />
      )}
      {activeTab === 'reading' && (
        <ReadingPipeline readingItems={readingItems} setReadingItems={setReadingItems} />
      )}
    </div>
  );
}
