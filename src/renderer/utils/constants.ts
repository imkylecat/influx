export interface Contributor {
  name: string;
  ids: readonly string[];
}

export const Contributor = Object.freeze({
  Kairu: { name: "Kairu", ids: ["1541892010338693120", "1541681151012241408"] },
} satisfies Record<string, Contributor>);

export const INFLUX_SERVER_INVITE_CODE = "5YmmEFoj";
