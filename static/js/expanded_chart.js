const ExpandedChart = {
    delimiters: ['[[', ']]'],
    props: [
        'modal_id', 'filtered_tests', 'show',
        'initial_max_test_on_chart', 'initial_chart_aggregation', 'initial_time_axis_type',
        'data_node', 'title',
    ],
    emits: ['update:show'],
    data() {
        return {
            chart_aggregation: 'mean',
            split_by_test: false,
            max_test_on_chart: 6,
            time_axis_type: false,
        }
    },
    mounted() {
        const chart_options = get_common_chart_options()
        window.charts.expanded_chart = new Chart('expanded_chart', chart_options)
        $(this.$el).on('hide.bs.modal', () => {
            this.$emit('update:show', false)
            window.charts.expanded_chart.clear()
        })
        $(this.$el).on('show.bs.modal', () => {
            this.max_test_on_chart = this.initial_max_test_on_chart
            this.chart_aggregation = this.initial_chart_aggregation
            this.time_axis_type = this.initial_time_axis_type
            this.split_by_test = false
            this.$emit('update:show', true)
            this.$nextTick(this.refresh_pickers)
            this.update_chart_all()
        })
        window.tst2 = this // todo: remove
    },
    watch: {
        show(newValue) {
            $(this.$el).modal(newValue ? 'show' : 'hide')
        },
        title(newValue) {
            window.charts.expanded_chart.config.options.plugins.title.text = newValue
            window.charts.expanded_chart.update()
        },
        chart_aggregation(newValue) {
            this.$nextTick(this.update_chart_all)
        },
        max_test_on_chart(newValue) {
            this.$nextTick(this.update_chart_all)
        },
        split_by_test(newValue) {
            window.charts.expanded_chart.options.interaction.mode = newValue ? 'nearest' : 'index'
            newValue ? this.update_chart_by_test() : this.update_chart_all()
        },
        time_axis_type(newValue) {
            window.charts.expanded_chart.options.scales.x.type = newValue ? 'time' : 'category'
            window.charts.expanded_chart.update()
        },
    },
    methods: {
        refresh_pickers() {
            $(this.$el).find('.selectpicker').selectpicker('redner').selectpicker('refresh')
        },
        update_chart_all() {
            const data = prepare_datasets(
                window.charts.expanded_chart,
                this.aggregated_data.data,
                true,
                // this.tests_need_grouping,
                // `metric[${this.data_node}]`
                'metric'
            )
            update_chart(window.charts.expanded_chart, {
                datasets: data,
                labels: this.aggregated_data.labels
            }, {
                tooltip: get_tooltip_options(
                    this.aggregated_data.aggregated_tests,
                    this.aggregated_data.names
                ),
            })
        },
        update_chart_by_test() {
            const split_by_name_tests = Object.entries(
                this.filtered_tests.reduce((accum, item) => {
                    const test_node_name = `${item.name}.${item.test_env}`
                    if (!accum.hasOwnProperty(test_node_name)) {
                        accum[test_node_name] = []
                    }
                    accum[test_node_name].push(item)
                    return accum
                }, {})
            )
            const data = split_by_name_tests.reduce((accum, [test_name, test_data]) => {
                let {data, labels} = accum
                const aggregated_data = this.get_aggregated_dataset(group_data(test_data, this.max_test_on_chart))
                const datasets = prepare_datasets(
                    window.charts.expanded_chart,
                    aggregated_data.data,
                    // this.need_grouping(test_data),
                    true,
                    `${test_name}:${this.data_node}`,
                    `${test_name}:min`,
                    `${test_name}:max`,
                )
                data = [...data, ...datasets]
                labels = new Set([...labels, ...aggregated_data.labels])
                return {data, labels}
            }, {data: [], labels: new Set()})
            data.labels = Array.from(data.labels)
            // const data = prepare_datasets(
            //     window.charts.expanded_chart,
            //     this.aggregated_data.data,
            //     this.tests_need_grouping,
            //     `metric[${this.data_node}]`
            // )
            update_chart(window.charts.expanded_chart, {
                datasets: data.data,
                labels: data.labels
            }, {
                // tooltip: get_tooltip_options(
                //     this.aggregated_data.aggregated_tests,
                //     this.aggregated_data.names
                // ),
            })
        },
        need_grouping(tests) {
            return tests.length > this.max_test_on_chart
        },
        handle_image_download() {
            const a = document.createElement('a')
            a.href = window.charts.expanded_chart.toBase64Image()
            a.download = `analytics_${window.charts.expanded_chart.options.plugins.title.text}.png`.replace(
                ' - ', '_').replace(' ', '_').toLowerCase()
            a.click()
            a.remove()
        },
        get_aggregated_dataset(grouped_data) {
            const struct = {
                labels: [],
                aggregated_tests: [],
                names: [],
                data: {
                    min: [],
                    max: [],
                    main: []
                },
            }
            grouped_data.forEach(group => {
                let dataset
                if (group.hasOwnProperty(this.data_node)) {
                    // for plain metrics
                    dataset = group[this.data_node]
                    struct.data.min.push(aggregation_callback_map.min(dataset))
                    struct.data.max.push(aggregation_callback_map.max(dataset))
                } else if (group.aggregations.hasOwnProperty(this.data_node)) {
                    // for aggregated metrics
                    dataset = group.aggregations[this.data_node]
                    !group.aggregations.min ?
                        console.warn('No aggregation "min" for ', group) :
                        struct.data.min.push(this.aggregation_callback(group.aggregations.min))
                    !group.aggregations.max ?
                        console.warn('No aggregation "max" for ', group) :
                        struct.data.max.push(this.aggregation_callback(group.aggregations.max))
                } else {
                    console.warn('No data "', this.data_node, '" in ', group)
                    return
                }
                switch (this.data_node) {
                    case 'min':
                        struct.data.main = struct.data.min
                        break
                    case 'max':
                        struct.data.main = struct.data.max
                        break
                    default:
                        struct.data.main.push(this.aggregation_callback(dataset))
                        break
                }
                struct.labels.push(group.start_time)
                struct.aggregated_tests.push(group.aggregated_tests)
                struct.names.push(group.name)
            })
            return struct
        },
    },
    computed: {
        aggregation_callback() {
            return aggregation_callback_map[this.chart_aggregation] || aggregation_callback_map.mean
        },
        aggregated_data() {
            return this.get_aggregated_dataset(group_data(this.filtered_tests, this.max_test_on_chart))
        },
        tests_need_grouping() {
            return this.need_grouping(this.filtered_tests)
        }
    },
    template: `
<div :id="modal_id" class="modal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered"
        style="min-width: 1200px;"
    >
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">Chart details</h3>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
<!--                <p>Modal body text goes here.</p>-->
<!--filtered_tests: [[ filtered_tests ]]-->
<div class="d-flex align-items-center">
<div><h5>Toolbar</h5></div>
<div class="d-flex flex-grow-1 justify-content-end align-items-center filter-container">

<div class="custom-input custom-input__sm">
<label class="d-flex align-items-center filter-container">
    <span>Max tests on chart</span>
    <input type="number" class="form-control my-0" 
        style="max-width: 60px;"
        v-model="max_test_on_chart"
    >
</label>
</div>

<div class="d-inline-flex filter-container align-items-center">
    <span class="text-right">aggregated data</span>
    <label class="custom-toggle mt-0">
        <input type="checkbox" v-model="split_by_test">
        <span class="custom-toggle_slider round"></span>
    </label>
    <span>test split data</span>
</div>

<div class="selectpicker-titled d-inline-flex">
    <span class="font-h6 font-semibold px-3 item__left text-uppercase">chart aggregation</span>
    <select class="selectpicker flex-grow-1" data-style="item__right"
        v-model="chart_aggregation"
    >
        <option value="min">min</option>
        <option value="max">max</option>
        <option value="mean">mean</option>
        <option value="pct50">50 pct</option>
        <option value="pct75">75 pct</option>
        <option value="pct90">90 pct</option>
        <option value="pct95">95 pct</option>
        <option value="pct99">99 pct</option>
    </select>
</div>

<div class="d-inline-flex filter-container align-items-center">
    <span class="text-right">categorical axis</span>
    <label class="custom-toggle mt-0">
        <input type="checkbox" v-model="time_axis_type">
        <span class="custom-toggle_slider round"></span>
    </label>
    <span>time axis</span>
</div>

<button class="btn btn-secondary" @click="handle_image_download">Download image</button>
</div>
</div>
                <canvas id="expanded_chart"></canvas>
            </div>
<!--            <div class="modal-footer">-->
<!--                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>-->
<!--                <button type="button" class="btn btn-primary">Save changes</button>-->
<!--            </div>-->
        </div>
    </div>
</div>
    `
}

register_component('ExpandedChart', ExpandedChart)