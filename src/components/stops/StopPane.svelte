<script>
	import ArrivalDeparture from '$components/ArrivalDeparture.svelte';
	import TripDetailsPane from '$components/oba/TripDetailsPane.svelte';
	import LoadingSpinner from '$components/LoadingSpinner.svelte';
	import Accordion from '$components/containers/SingleSelectAccordion.svelte';
	import AccordionItem from '$components/containers/AccordionItem.svelte';
	import SurveyModal from '$components/surveys/SurveyModal.svelte';
	import ServiceAlerts from '$components/service-alerts/ServiceAlerts.svelte';
	import { onDestroy } from 'svelte';
	import '$lib/i18n.js';
	import { isLoading, t } from 'svelte-i18n';
	import { submitHeroQuestion, skipSurvey } from '$lib/Surveys/surveyUtils';
	import { surveyStore, showSurveyModal, markSurveyAnswered } from '$stores/surveyStore';
	import { getUserId } from '$lib/utils/user';
	import HeroQuestion from '$components/surveys/HeroQuestion.svelte';
	import analytics from '$lib/Analytics/PlausibleAnalytics';
	import { filterActiveAlerts } from '$components/service-alerts/serviceAlertsHelper';

	/**
	 * @typedef {Object} Props
	 * @property {any} stop
	 * @property {any} [arrivalsAndDeparturesResponse]
	 */

	/** @type {Props} */
	let {
		stop,
		handleUpdateRouteMap = null,
		tripSelected = null,
		arrivalsAndDeparturesResponse = $bindable(null)
	} = $props();

	let arrivalsAndDepartures = $state();
	let loading = $state(false);
	let error = $state();
	let serviceAlerts = $state([]);

	let interval = null;
	let currentStopSurvey = $state(null);
	let remainingSurveyQuestions = $state([]);

	async function loadData(stopID) {
		loading = true;
		const response = await fetch(`/api/oba/arrivals-and-departures-for-stop/${stopID}`);

		if (response.ok) {
			arrivalsAndDeparturesResponse = await response.json();
			arrivalsAndDepartures = arrivalsAndDeparturesResponse.data.entry;
			let situations = arrivalsAndDeparturesResponse.data.references.situations || [];
			serviceAlerts = filterActiveAlerts(situations);
		} else {
			error = 'Unable to fetch arrival/departure data';
		}
		loading = false;
	}

	function resetDataFetchInterval(stopID) {
		if (interval) clearInterval(interval);

		loadData(stopID);

		interval = setInterval(() => {
			loadData(stopID);
		}, 30000);
	}

	$effect(() => {
		if (stop?.id) {
			clearInterval(interval);
			resetDataFetchInterval(stop.id);
		}
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});

	let _routeShortNames = null;
	function routeShortNames() {
		if (!_routeShortNames && arrivalsAndDeparturesResponse?.data?.references?.routes) {
			_routeShortNames = arrivalsAndDeparturesResponse.data.references.routes
				.filter((r) => stop.routeIds.includes(r.id))
				.map((r) => r.nullSafeShortName)
				.sort();
		}
		return _routeShortNames;
	}

	function handleAccordionSelectionChanged(event) {
		const data = event.activeData; // this is the ArrivalDeparture object plumbed into the AccordionItem
		const show = !!data;
		if (tripSelected) {
			tripSelected({ detail: data });
		}
		if (handleUpdateRouteMap) {
			handleUpdateRouteMap({ detail: { show } });
		}
		analytics.reportArrivalClicked('Clicked on arrival/departure');
	}

	let heroAnswer = '';
	let nextSurveyQuestion = $state(false);
	let surveyPublicIdentifier = $state(null);
	let showHeroQuestion = $state(true);

	async function handleSurveyButtonClick() {
		let heroQuestion = currentStopSurvey.questions[0];
		remainingSurveyQuestions = currentStopSurvey.questions.slice(1);
		if (heroQuestion.content.type !== 'label' && (!heroAnswer || heroAnswer.trim() === '')) {
			return;
		}

		// If there are more questions, show the modal
		if (remainingSurveyQuestions.length > 0) {
			showSurveyModal.set(true);
		}
		nextSurveyQuestion = true;

		let surveyResponse = {
			survey_id: currentStopSurvey.id,
			user_identifier: getUserId(),
			stop_identifier: stop.id,
			stop_latitude: stop.lat,
			stop_longitude: stop.lon,
			responses: []
		};

		surveyResponse.responses[0] = {
			question_id: heroQuestion.id,
			question_label: heroQuestion.content.label_text,
			question_type: heroQuestion.content.type,
			answer: heroAnswer
		};

		surveyPublicIdentifier = await submitHeroQuestion(surveyResponse);
		showHeroQuestion = false;

		markSurveyAnswered(currentStopSurvey.id);
	}

	function handleSkip() {
		skipSurvey(currentStopSurvey);
		showHeroQuestion = false;
	}
	function handleHeroQuestionChange(event) {
		heroAnswer = event.target.value;
	}

	$effect(() => {
		currentStopSurvey = $surveyStore;
	});
</script>

{#if $isLoading}
	<p>Loading...</p>
{:else}
	<div>
		{#if loading && isLoading && tripSelected}
			<LoadingSpinner />
		{/if}

		{#if error}
			<p>{error}</p>
		{/if}
		{#if arrivalsAndDepartures}
			<div class="space-y-4">
				<div>
					<div
						class="relative flex flex-col gap-y-1 rounded-lg bg-brand-secondary bg-opacity-80 p-4"
					>
						<h1 class="h1 mb-0 text-white">{stop.name}</h1>
						<h2 class="h2 mb-0 text-white">{$t('stop')} #{stop.id}</h2>
						{#if routeShortNames()}
							<h2 class="h2 mb-0 text-white">{$t('routes')}: {routeShortNames().join(', ')}</h2>
						{/if}

						{#if tripSelected}
							<div class="mt-auto flex justify-end">
								<a
									href={`/stops/${stop.id}/schedule`}
									class="inline-block rounded-lg border border-brand bg-brand px-3 py-1 text-sm font-medium text-white shadow-md transition duration-200 ease-in-out hover:bg-brand-secondary"
									target="_blank"
								>
									{$t('schedule_for_stop.view_schedule')}
								</a>
							</div>
						{/if}
					</div>
				</div>

				{#if serviceAlerts}
					<ServiceAlerts bind:serviceAlerts />
				{/if}

				{#if showHeroQuestion && currentStopSurvey}
					<HeroQuestion
						{currentStopSurvey}
						{handleSkip}
						{handleSurveyButtonClick}
						{handleHeroQuestionChange}
						remainingQuestionsLength={remainingSurveyQuestions.length}
					/>
				{/if}
				{#if nextSurveyQuestion}
					<SurveyModal
						currentSurvey={currentStopSurvey}
						{stop}
						skipHeroQuestion={true}
						surveyPublicId={surveyPublicIdentifier}
					/>
				{/if}

				{#if arrivalsAndDepartures.arrivalsAndDepartures.length === 0}
					<div class="flex items-center justify-center">
						<p>{$t('no_arrivals_or_departures_in_next_30_minutes')}</p>
					</div>
				{:else}
					{#key arrivalsAndDepartures.stopId}
						<Accordion {handleAccordionSelectionChanged}>
							{#each arrivalsAndDepartures.arrivalsAndDepartures as arrival}
								<AccordionItem data={arrival}>
									{#snippet header()}
										<span>
											<ArrivalDeparture arrivalDeparture={arrival} />
										</span>
									{/snippet}
									<TripDetailsPane
										{stop}
										tripId={arrival.tripId}
										serviceDate={arrival.serviceDate}
									/>
								</AccordionItem>
							{/each}
						</Accordion>
					{/key}
				{/if}
			</div>
		{/if}
	</div>
{/if}
