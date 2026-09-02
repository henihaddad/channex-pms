/**
 * Who sleeps in a room: adults, children (with ages, which drive pricing and
 * tourist-tax exemptions) and infants. Matches Channex's occupancy shape.
 */
export interface OccupancyLimits {
  maxAdults: number;
  maxChildren: number;
  maxInfants: number;
  maxOccupancy: number;
}

export class Occupancy {
  private constructor(
    readonly adults: number,
    readonly childrenAges: readonly number[],
    readonly infants: number,
  ) {}

  static of(adults: number, childrenAges: readonly number[] = [], infants = 0): Occupancy {
    for (const [name, n] of [
      ["adults", adults],
      ["infants", infants],
    ] as const) {
      if (!Number.isInteger(n) || n < 0)
        throw new TypeError(`${name} must be a non-negative integer`);
    }
    if (adults < 1) throw new TypeError("An occupancy needs at least one adult");
    for (const age of childrenAges) {
      if (!Number.isInteger(age) || age < 0 || age > 17) {
        throw new TypeError(`Child age must be an integer between 0 and 17, got ${String(age)}`);
      }
    }
    return new Occupancy(
      adults,
      [...childrenAges].sort((a, b) => a - b),
      infants,
    );
  }

  get children(): number {
    return this.childrenAges.length;
  }

  /** Persons counted for occupancy pricing: adults + children. Infants never count. */
  get persons(): number {
    return this.adults + this.children;
  }

  fits(limits: OccupancyLimits): boolean {
    return (
      this.adults <= limits.maxAdults &&
      this.children <= limits.maxChildren &&
      this.infants <= limits.maxInfants &&
      this.persons <= limits.maxOccupancy
    );
  }

  /** Children at or above `minAge` count as adults for a given tax or rate rule. */
  countingChildrenAsAdultsFrom(minAge: number): { adults: number; children: number } {
    const promoted = this.childrenAges.filter((a) => a >= minAge).length;
    return { adults: this.adults + promoted, children: this.children - promoted };
  }

  equals(other: Occupancy): boolean {
    return (
      this.adults === other.adults &&
      this.infants === other.infants &&
      this.childrenAges.length === other.childrenAges.length &&
      this.childrenAges.every((a, i) => a === other.childrenAges[i])
    );
  }

  toJSON(): { adults: number; children: number; infants: number; ages: number[] } {
    return {
      adults: this.adults,
      children: this.children,
      infants: this.infants,
      ages: [...this.childrenAges],
    };
  }
}
