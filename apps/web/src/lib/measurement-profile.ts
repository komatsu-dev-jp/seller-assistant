import {
  listingPrepPilotMeasurementTemplates,
  type MeasurementProfileResponse,
} from "@resale/contracts";

export type MeasurementDefinition = {
  definitionId: string;
  label: string;
  definitionVersion: number;
  basis: "flat_width" | "circumference" | "length";
  state: "natural" | "closed" | "unstretched";
};

const legacyDefinitions: readonly MeasurementDefinition[] = [
  {
    definitionId: "shoulder_width",
    label: "肩幅",
    definitionVersion: 1,
    basis: "length",
    state: "natural",
  },
  {
    definitionId: "chest_width",
    label: "身幅",
    definitionVersion: 1,
    basis: "flat_width",
    state: "natural",
  },
  {
    definitionId: "sleeve_length",
    label: "袖丈",
    definitionVersion: 1,
    basis: "length",
    state: "natural",
  },
  {
    definitionId: "body_length",
    label: "着丈",
    definitionVersion: 1,
    basis: "length",
    state: "natural",
  },
];

export function measurementDefinitionsFor(
  profile: MeasurementProfileResponse | null,
): readonly MeasurementDefinition[] {
  return profile?.definitions ?? legacyDefinitions;
}

export function completeMeasurements(
  definitions: readonly MeasurementDefinition[],
  values: Record<string, string>,
): boolean {
  return definitions.every((definition) => {
    const value = Number(values[definition.definitionId]);
    return value > 0 && value <= 250;
  });
}

export const categoryTemplates = Object.values(listingPrepPilotMeasurementTemplates).map(
  (template) => ({
    category: template.category,
    label: template.categoryLabel,
    measurementTemplateId: template.id,
  }),
);

export function templateForCategory(category: string): string | null {
  return (
    categoryTemplates.find((template) => template.category === category)?.measurementTemplateId ??
    null
  );
}
