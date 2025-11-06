import { Mic } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Header() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold text-xl">
          <div className="rounded-lg bg-primary p-2">
            <Mic className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-foreground">Voice Note Taker</span>
        </Link>
        
        <nav className="flex items-center gap-4">
          <Link to="/">
            <Button 
              variant={location.pathname === '/' ? 'default' : 'ghost'}
              size="sm"
            >
              Notes
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
