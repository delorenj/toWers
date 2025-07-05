'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface LegalDocProps {
  title: string;
  description?: string;
  lastUpdated?: string;
  children: React.ReactNode;
}

export function LegalDoc({ title, description, lastUpdated, children }: LegalDocProps) {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/legal">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">{t('legal.backToLegal')}</span>
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">{t('legal.lastUpdated')}: {lastUpdated}</p>
        )}
        <Separator className="my-4" />
      </div>

      <Card className="overflow-hidden">
        <ScrollArea className="h-[var(--legal-content)] w-full p-6">
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            {children}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
