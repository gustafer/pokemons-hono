import { Hono } from "hono";
import { buildTursoClient } from "../../db/db";
import { Env } from "../../types/env";
import { pokemons, pokemonsTypelist, typeList } from "../../db/schema";
import { count, eq, gt, sql, inArray, asc } from "drizzle-orm";
import { PokemonGroup } from "../../types/pokemon-group";

export const pokemonsRoute = new Hono<{ Bindings: Env }>()

export const mergePokemonsFromResult = (
    pokemons: {
        id: number;
        name: string;
    }[],
    pokemonTypeList: {
        pokemons_typelist: {
            pokemonId: string | null;
            typeId: number;
        };
        type_list: {
            id: number;
            type: string | null;
        };
    }[]): PokemonGroup[] => {
    return pokemons.map(m => ({
        id: m.id,
        name: m.name,
        types: pokemonTypeList.filter(f => f.pokemons_typelist.pokemonId === m.id.toString()).map(m2 => m2.type_list.type?.toString() || ``)
    }))
}

pokemonsRoute.get('/', async (c) => {
    const db = buildTursoClient(c.env)
    const { pageIndex, query } = c.req.query()

    const maxResults = 20
    const page = Number(pageIndex) * maxResults


    const pokemonsResults = await db
        .select()
        .from(pokemons)
        .where(query ? sql`${pokemons.name} LIKE ${'%' + query + '%'}` : gt(pokemons.id, 0))
        .limit(maxResults)
        .offset(page)
        .orderBy(asc(pokemons.id));

    const pokemonsWithTypelist = await db
        .select()
        .from(pokemonsTypelist)
        .innerJoin(typeList, eq(typeList.id, pokemonsTypelist.typeId))
        .where(inArray(pokemonsTypelist.pokemonId, pokemonsResults.map(m => m.id.toString())));

    const pokemonsCount = await db
        .select({ count: count(pokemons)})
        .from(pokemons)
        .where(query ? sql`${pokemons.name} LIKE ${'%' + query + '%'}` : gt(pokemons.id, 0));

    if (pokemonsCount.length < 1) return c.json({ message: "no pokemons found" }, 404)

    const maxPokemons = Math.floor(pokemonsCount[0].count)
    const maxPages = Math.floor(maxPokemons / maxResults)

    return c.json({ totalCount: pokemonsCount[0].count, maxPages, pageIndex: Number(pageIndex ), pokemons: mergePokemonsFromResult(pokemonsResults, pokemonsWithTypelist) })
})