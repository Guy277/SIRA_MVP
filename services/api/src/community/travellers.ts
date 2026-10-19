import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { COMMUNITY_URL } from "./community.controller";

// Who is behind a session token. The community service signs the tokens, so it
// is the one asked: the API keeps no copy of the signing key.
@Injectable()
export class Travellers {
  async idFrom(authorization: string | undefined): Promise<string> {
    if (!authorization) throw new UnauthorizedException("Connecte-toi pour signaler ou confirmer un incident.");
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${COMMUNITY_URL}/auth/me`, { headers: { authorization }, signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new ServiceUnavailableException("Le service des comptes SIRA est indisponible.");
    }
    if (response.status === 401) throw new UnauthorizedException("Session expirée. Reconnecte-toi.");
    const user = response.ok ? await response.json().catch(() => null) as { id?: unknown } | null : null;
    if (typeof user?.id !== "string" || !user.id) throw new ServiceUnavailableException("Le service des comptes SIRA est indisponible.");
    return user.id;
  }
}
