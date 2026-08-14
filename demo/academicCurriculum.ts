import type { GeneratedNodeContext, GeneratedNodeData } from "../src";

interface CurriculumDomain {
  readonly label: string;
  readonly topics: readonly string[];
}

interface CurriculumPosition {
  readonly domainIndex: number;
  readonly rank: number;
}

const DOMAINS: readonly CurriculumDomain[] = [
  {
    label: "Mathematics",
    topics: ["Number sense", "Fractions & ratios", "Algebra", "Geometry", "Functions & graphs", "Trigonometry", "Calculus", "Linear algebra", "Probability", "Statistics", "Differential equations", "Optimization", "Numerical methods", "Mathematical proof"],
  },
  {
    label: "Physics",
    topics: ["Measurement", "Motion", "Forces", "Energy & momentum", "Oscillations", "Thermodynamics", "Electricity", "Magnetism", "Optics", "Fluid dynamics", "Relativity", "Quantum physics", "Solid-state physics", "Computational physics"],
  },
  {
    label: "Computer science",
    topics: ["Computational thinking", "Programming fundamentals", "Data structures", "Algorithms", "Computer architecture", "Operating systems", "Databases", "Computer networks", "Software engineering", "Web systems", "Distributed systems", "Machine learning", "Cybersecurity", "Compiler design"],
  },
  {
    label: "Biology",
    topics: ["Scientific observation", "Cell biology", "Genetics", "Evolution", "Ecology", "Human anatomy", "Physiology", "Microbiology", "Molecular biology", "Biochemistry", "Immunology", "Neuroscience", "Bioinformatics", "Systems biology"],
  },
  {
    label: "Chemistry",
    topics: ["Matter & measurement", "Atomic structure", "Chemical bonding", "Stoichiometry", "Chemical reactions", "Thermochemistry", "Equilibrium", "Acids & bases", "Organic chemistry", "Analytical chemistry", "Physical chemistry", "Materials chemistry", "Spectroscopy", "Chemical research"],
  },
  {
    label: "Economics",
    topics: ["Economic reasoning", "Markets", "Supply & demand", "Consumer choice", "Firm behavior", "Macroeconomics", "Money & banking", "Public economics", "Game theory", "Econometrics", "International trade", "Development economics", "Behavioral economics", "Policy analysis"],
  },
  {
    label: "Psychology",
    topics: ["Human behavior", "Research methods", "Learning & memory", "Cognition", "Development", "Social psychology", "Personality", "Biological psychology", "Psychological measurement", "Clinical psychology", "Organizational psychology", "Cognitive neuroscience", "Experimental design", "Evidence synthesis"],
  },
  {
    label: "Engineering",
    topics: ["Technical drawing", "Engineering mathematics", "Statics", "Dynamics", "Materials", "Circuits", "Signals & systems", "Control systems", "Mechanics of machines", "Product design", "Manufacturing", "Embedded systems", "Systems engineering", "Engineering capstone"],
  },
  {
    label: "Humanities",
    topics: ["Close reading", "Academic writing", "World history", "Philosophy", "Ethics", "Literary analysis", "Political thought", "Cultural studies", "Historiography", "Rhetoric", "Comparative literature", "Philosophy of science", "Digital humanities", "Independent thesis"],
  },
  {
    label: "Research practice",
    topics: ["Information literacy", "Source evaluation", "Research questions", "Study design", "Data collection", "Data visualization", "Statistical inference", "Reproducible analysis", "Scientific writing", "Peer review", "Research ethics", "Open science", "Interdisciplinary methods", "Thesis defense"],
  },
] as const;

const VARIANTS = ["Practice", "Laboratory", "Seminar", "Project", "Assessment", "Capstone"] as const;

export function createAcademicCurriculumData() {
  const positions = new Map<string, CurriculumPosition>();
  const repetitions = new Map<string, number>();
  let nextDomain = 0;

  return (context: GeneratedNodeContext): GeneratedNodeData => {
    if (context.parentId === null) {
      positions.set(context.id, { domainIndex: 0, rank: -2 });
      return { label: "Academic learning map", ordinal: context.ordinal };
    }

    if (context.depth === 1) {
      const domainIndex = nextDomain % DOMAINS.length;
      nextDomain += 1;
      positions.set(context.id, { domainIndex, rank: -1 });
      return { label: DOMAINS[domainIndex]?.label ?? "Learning domain", ordinal: context.ordinal };
    }

    const parent = positions.get(context.parentId) ?? {
      domainIndex: context.ordinal % DOMAINS.length,
      rank: -1,
    };
    const domain = DOMAINS[parent.domainIndex] ?? DOMAINS[0]!;
    const rankStep = context.ordinal % 3 === 0 ? 2 : 1;
    const rank = Math.min(domain.topics.length - 1, parent.rank + rankStep);
    positions.set(context.id, { domainIndex: parent.domainIndex, rank });

    const baseLabel = domain.topics[rank] ?? domain.label;
    const repetitionKey = `${parent.domainIndex}:${baseLabel}`;
    const repetition = repetitions.get(repetitionKey) ?? 0;
    repetitions.set(repetitionKey, repetition + 1);
    if (repetition === 0) return { label: baseLabel, ordinal: context.ordinal };

    const variant = VARIANTS[(repetition - 1) % VARIANTS.length] ?? "Practice";
    const cycle = Math.floor((repetition - 1) / VARIANTS.length);
    const suffix = cycle === 0 ? variant : `${variant} ${cycle + 1}`;
    return { label: `${baseLabel} · ${suffix}`, ordinal: context.ordinal };
  };
}
