import { fetchAutocompleteResults } from '$lib/geocoder';

import { PRIVATE_OBA_GEOCODER_PROVIDER as geocoderProvider } from '$env/static/private';

import { env } from '$env/dynamic/private';

let geocoderApiKey = env.PRIVATE_OBA_GEOCODER_API_KEY;

export async function GET({ url }) {
	const searchInput = url.searchParams.get('query')?.trim();

	const suggestions = await fetchAutocompleteResults(geocoderProvider, searchInput, geocoderApiKey);

	return new Response(
		JSON.stringify({
			suggestions
		}),
		{
			headers: {
				'Content-Type': 'application/json'
			}
		}
	);
}
