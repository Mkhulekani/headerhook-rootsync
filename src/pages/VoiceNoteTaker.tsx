import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Save, Trash2, Download, Plus, Edit2, Play, Pause, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Note {
  id: string;
  title: string;
  content: string;
  audioData: string | null;
  timestamp: number;
}

export default function VoiceNoteTaker() {
  const [isListening, setIsListening] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<Note>({ 
    id: '', 
    title: '', 
    content: '', 
    audioData: null,
    timestamp: 0
  });
  const [browserSupport, setBrowserSupport] = useState(true);
  const [status, setStatus] = useState('');
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadNotes();
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setBrowserSupport(false);
      setStatus('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      if (finalTranscript) {
        setCurrentNote(prev => ({ ...prev, content: prev.content + finalTranscript }));
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        toast.error('No speech detected. Please try again.');
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone access denied');
      } else {
        toast.error(`Error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current && isListening) recognitionRef.current.stop();
      if (mediaRecorderRef.current && isRecordingAudio) mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const loadNotes = async () => {
    try {
      const result = await (window as any).storage.list('note:');
      if (result?.keys?.length > 0) {
        const loadedNotes: Note[] = [];
        for (const key of result.keys) {
          try {
            const noteData = await (window as any).storage.get(key);
            if (noteData?.value) loadedNotes.push(JSON.parse(noteData.value));
          } catch (err) {
            console.error('Error loading note:', key, err);
          }
        }
        setNotes(loadedNotes.sort((a, b) => b.timestamp - a.timestamp));
      }
    } catch (error) {
      console.log('No saved notes yet');
    }
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      
      const options: MediaRecorderOptions = { mimeType: 'audio/webm' };
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length === 0) {
          toast.error('No audio data captured');
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType! });
        const reader = new FileReader();
        reader.onloadend = () => {
          setCurrentNote(prev => ({ ...prev, audioData: reader.result as string }));
          toast.success('Voice recording captured!');
        };
        reader.onerror = () => toast.error('Failed to process audio recording');
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecordingAudio(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Microphone access denied');
      } else if (error.name === 'NotFoundError') {
        toast.error('No microphone found');
      } else {
        toast.error(`Recording failed: ${error.message}`);
      }
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingAudio(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const toggleListening = async () => {
    if (!browserSupport) {
      toast.error('Speech recognition not supported in your browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      stopAudioRecording();
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingNoteId(null);
      await startAudioRecording();
      recognitionRef.current.start();
    }
  };

  const saveNote = async () => {
    if (!currentNote.content.trim() && !currentNote.audioData) {
      toast.error('Cannot save empty note');
      return;
    }

    const noteId = currentNote.id || `note_${Date.now()}`;
    const noteToSave: Note = {
      id: noteId,
      title: currentNote.title.trim() || `Note - ${new Date().toLocaleString()}`,
      content: currentNote.content.trim(),
      audioData: currentNote.audioData,
      timestamp: Date.now()
    };

    try {
      await (window as any).storage.set(`note:${noteId}`, JSON.stringify(noteToSave));
      await loadNotes();
      setCurrentNote({ id: '', title: '', content: '', audioData: null, timestamp: 0 });
      toast.success('Note saved successfully!');
    } catch (error) {
      toast.error('Failed to save note');
    }
  };

  const deleteNote = async (noteId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await (window as any).storage.delete(`note:${noteId}`);
      await loadNotes();
      if (currentNote.id === noteId) {
        setCurrentNote({ id: '', title: '', content: '', audioData: null, timestamp: 0 });
      }
      toast.success('Note deleted');
    } catch (error) {
      toast.error('Failed to delete note');
    }
  };

  const playAudio = (audioData: string, noteId: string) => {
    if (isListening || isRecordingAudio) {
      toast.error('Cannot play audio while recording');
      return;
    }
    
    if (playingNoteId === noteId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingNoteId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(audioData);
      audioRef.current.play();
      setPlayingNoteId(noteId);
      audioRef.current.onended = () => {
        setPlayingNoteId(null);
        audioRef.current = null;
      };
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/20 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Mic className="h-8 w-8" />
                  Voice Note Taker
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Record audio + transcribe speech automatically
                </CardDescription>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Notes</p>
                <p className="text-3xl font-bold text-primary">{notes.length}</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {!browserSupport && (
          <Alert variant="destructive">
            <AlertDescription>
              Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <label className="text-sm font-semibold mb-2 block">Note Title</label>
                  <Input
                    placeholder="Enter a title for your note..."
                    value={currentNote.title}
                    onChange={(e) => setCurrentNote({ ...currentNote, title: e.target.value })}
                  />
                </div>

                {currentNote.audioData && (
                  <Card className="bg-accent">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Volume2 className="h-6 w-6 text-accent-foreground" />
                          <div>
                            <p className="font-semibold">Audio Recording Available</p>
                            <p className="text-sm text-muted-foreground">Click play to listen</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => playAudio(currentNote.audioData!, 'current')}
                            disabled={isListening || isRecordingAudio}
                            size="sm"
                          >
                            {playingNoteId === 'current' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div>
                  <label className="text-sm font-semibold mb-2 block">Transcription</label>
                  <Textarea
                    placeholder="Click 'Start Recording' to transcribe speech, or type here manually..."
                    value={currentNote.content}
                    onChange={(e) => setCurrentNote({ ...currentNote, content: e.target.value })}
                    className="h-64 font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    {currentNote.content.length} characters | {currentNote.content.trim().split(/\s+/).filter(w => w).length} words
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={toggleListening}
                    disabled={!browserSupport}
                    variant={isListening ? "destructive" : "default"}
                    className="gap-2"
                  >
                    {isListening ? <><MicOff className="h-4 w-4" /> Stop Recording</> : <><Mic className="h-4 w-4" /> Start Recording</>}
                  </Button>
                  <Button onClick={saveNote} variant="default" className="gap-2">
                    <Save className="h-4 w-4" /> Save Note
                  </Button>
                  <Button onClick={() => setCurrentNote({ id: '', title: '', content: '', audioData: null, timestamp: 0 })} variant="secondary" className="gap-2">
                    <Plus className="h-4 w-4" /> New Note
                  </Button>
                </div>

                {isListening && (
                  <Alert>
                    <AlertDescription className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                        <span className="font-semibold">🔴 RECORDING - {formatTime(recordingTime)}</span>
                      </div>
                      <span className="text-sm">Audio + Transcription active</span>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Saved Notes</CardTitle>
                {notes.length > 0 && <Badge variant="secondary">{notes.length}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {notes.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-4xl mb-3">📭</p>
                    <p className="text-muted-foreground text-sm">No saved notes yet</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <Card
                      key={note.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        currentNote.id === note.id ? 'border-primary' : ''
                      }`}
                      onClick={() => setCurrentNote(note)}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold flex-1 line-clamp-1">{note.title}</h3>
                          {currentNote.id === note.id && <Edit2 className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {new Date(note.timestamp).toLocaleString()}
                        </p>
                        {note.audioData && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              playAudio(note.audioData!, note.id);
                            }}
                            disabled={isListening || isRecordingAudio}
                            size="sm"
                            variant="secondary"
                            className="mb-2 gap-1"
                          >
                            {playingNoteId === note.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            {playingNoteId === note.id ? 'Pause' : 'Play'}
                          </Button>
                        )}
                        <p className="text-sm line-clamp-2 mb-3">{note.content}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {note.content.trim().split(/\s+/).filter(w => w).length} words
                            {note.audioData && ' • 🎵'}
                          </span>
                          <Button
                            onClick={(e) => deleteNote(note.id, e)}
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
