'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface FaqItem {
  question: string
  answer: string
}

interface FaqAccordionProps {
  items: FaqItem[]
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  return (
    <Accordion type="single" collapsible className="w-full space-y-2">
      {items.map((item, i) => (
        <AccordionItem key={i} value={`item-${i}`} className="glass-card rounded-xl border-0 px-6">
          <AccordionTrigger className="text-white hover:no-underline text-left py-5">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="text-slate-300 pb-5 leading-relaxed">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
