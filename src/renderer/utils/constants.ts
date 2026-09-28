export interface Contributor {
  name: string;
  id: string;
}

export const Contributor = Object.freeze({
  Kairu: { name: "Kairu", id: "1541892010338693120" },
} satisfies Record<string, Contributor>);

export const INFLUX_SERVER_INVITE_CODE = "5YmmEFoj";
